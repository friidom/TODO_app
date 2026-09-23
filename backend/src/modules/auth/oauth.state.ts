import { createHash, randomBytes } from "node:crypto";

import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../../config/env.js";
import { constantTimeEquals } from "../../lib/oauth/google.js";
import type { OAuthProvider } from "../../lib/oauth/identity.js";

export const OAUTH_COOKIE = "oauth_tx";

const TTL_SECONDS = 600;

// This cookie is signed with JWT_SECRET and HS256 -- the same pair lib/tokens.ts
// uses for access tokens -- and verifyAccessToken accepts any HS256 token
// carrying `sub` and `jti`. Today only the absence of those claims keeps the two
// apart, which would quietly stop being true the moment somebody signed this
// payload with `subject: linkUserId`. The type claim is what makes them
// genuinely non-interchangeable.
const TOKEN_TYPE = "oauth_tx";

export type OAuthMode = "login" | "link";

export interface OAuthTransaction {
  provider: OAuthProvider;
  state: string;
  verifier: string;
  nonce: string;
  next: string | null;
  mode: OAuthMode;
  // Present only for mode "link", and only ever copied from a VERIFIED access
  // token. If this could be influenced by the browser, the callback would
  // become "attach this identity to whoever is named", which is a phishable
  // account takeover.
  linkUserId: string | null;
}

// SameSite is pinned to "lax" rather than read from COOKIE_SAMESITE, and that
// is load-bearing: this cookie has to survive the provider's cross-site
// top-level redirect back to us. Lax cookies are sent on a top-level GET
// navigation; Strict ones are not. With COOKIE_SAMESITE=strict the refresh
// cookie is still free to be strict, while this one would simply never arrive
// and every sign-in would fail as "invalid state".
//
// Path matches the refresh cookie, which covers both /start and /callback.
const OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax",
  path: "/api/v1/auth",
};

export function base64url(input: Buffer): string {
  return input.toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export interface MintedTransaction {
  token: string;
  state: string;
  nonce: string;
  verifier: string;
  codeChallenge: string;
}

export function mintTransaction(input: {
  provider: OAuthProvider;
  next: string | null;
  mode: OAuthMode;
  linkUserId: string | null;
}): MintedTransaction {
  const state = base64url(randomBytes(32));
  const nonce = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(32));

  const payload: OAuthTransaction = {
    provider: input.provider,
    state,
    verifier,
    nonce,
    next: input.next,
    mode: input.mode,
    linkUserId: input.linkUserId,
  };

  const token = jwt.sign({ ...payload, typ: TOKEN_TYPE }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: TTL_SECONDS,
  });

  return { token, state, nonce, verifier, codeChallenge: pkceChallenge(verifier) };
}

export function setTransactionCookie(res: Response, token: string): void {
  res.cookie(OAUTH_COOKIE, token, { ...OPTIONS, maxAge: TTL_SECONDS * 1000 });
}

// Every option except maxAge must match what was set, or the browser clears a
// different cookie and keeps this one.
export function clearTransactionCookie(res: Response): void {
  res.clearCookie(OAUTH_COOKIE, OPTIONS);
}

function isProviderMatch(value: unknown, provider: OAuthProvider): boolean {
  return value === provider;
}

// Returns the transaction only when the cookie is ours, unexpired, for this
// provider, and its state matches the one the provider echoed back.
export function readTransaction(
  req: Request,
  provider: OAuthProvider,
  presentedState: string,
): OAuthTransaction | null {
  const raw = (req.cookies as Record<string, unknown> | undefined)?.[OAUTH_COOKIE];

  if (typeof raw !== "string" || raw === "") return null;

  let payload: OAuthTransaction & { typ?: unknown };

  try {
    // algorithms pinned for the same reason lib/tokens.ts pins them: without
    // it a cookie carrying alg:"none" would be accepted as signed.
    payload = jwt.verify(raw, env.JWT_SECRET, { algorithms: ["HS256"] }) as OAuthTransaction & {
      typ?: unknown;
    };
  } catch {
    return null;
  }

  if (payload.typ !== TOKEN_TYPE) return null;

  if (!isProviderMatch(payload.provider, provider)) return null;

  if (typeof payload.state !== "string" || payload.state === "") return null;

  // Constant-time, because this is the CSRF token: it is what stops an
  // attacker delivering their OWN authorization code to the victim's callback
  // and quietly logging the victim into the attacker's account.
  if (!constantTimeEquals(payload.state, presentedState)) return null;

  return payload;
}
