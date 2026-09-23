import { timingSafeEqual } from "node:crypto";

import jwt from "jsonwebtoken";

import { createRemoteJwks, type FetchLike, type RemoteJwks } from "./jwks.js";
import { OAuthProviderError, type ProviderAdapter, type ProviderIdentity } from "./identity.js";

// Constants, never derived from anything in the request. A provider endpoint
// built out of user input is an SSRF hole with a token attached.
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

// Google legitimately emits both spellings. Typed as a non-empty tuple because
// that is the only shape jsonwebtoken's `issuer` option accepts.
const ISSUERS: [string, ...string[]] = ["https://accounts.google.com", "accounts.google.com"];

const CLOCK_TOLERANCE_SECONDS = 60;

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  // timingSafeEqual throws on a length mismatch, which would itself be a
  // timing signal, so the lengths are folded into the result instead.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);

    return false;
  }

  return timingSafeEqual(left, right);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// Google has historically emitted this as the string "true" as well as a
// boolean, and anything other than a definite yes must read as "not verified".
function isVerified(value: unknown): boolean {
  return value === true || value === "true";
}

export interface GoogleAdapterOptions {
  clientId: string;
  clientSecret: string;
  fetchImpl?: FetchLike;
  jwks?: RemoteJwks;
  now?: () => number;
}

export function createGoogleAdapter(options: GoogleAdapterOptions): ProviderAdapter {
  // Late-bound rather than captured at construction: resolving globalThis.fetch
  // here would freeze whatever existed at module load, and the integration
  // suite swaps in a fake provider after these adapters are already built.
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
  const jwks = options.jwks ?? createRemoteJwks(JWKS_URL, fetchImpl);
  const now = options.now ?? (() => Date.now());

  async function verifyIdToken(idToken: string, nonce: string): Promise<ProviderIdentity> {
    const decoded = jwt.decode(idToken, { complete: true });

    if (decoded === null || typeof decoded.payload === "string") {
      throw new OAuthProviderError("id_token_malformed", "Google returned an unreadable token.");
    }

    const { kid, alg } = decoded.header;

    // Pinned before the key lookup as well as inside verify(): a token
    // carrying alg:"none", or one signed HS256 against a public key treated as
    // an HMAC secret, must never reach the verifier.
    if (alg !== "RS256" || typeof kid !== "string") {
      throw new OAuthProviderError("id_token_alg", "Google returned an unexpected token type.");
    }

    const key = await jwks.get(kid, now());

    let payload: jwt.JwtPayload;

    try {
      // audience and issuer are enforced here, not read and compared after.
      // Without the audience check an ID token minted for ANY other Google
      // application would be accepted as our own.
      payload = jwt.verify(idToken, key, {
        algorithms: ["RS256"],
        audience: options.clientId,
        issuer: ISSUERS,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      }) as jwt.JwtPayload;
    } catch {
      throw new OAuthProviderError("id_token_invalid", "Could not verify Google's response.");
    }

    const claimedNonce = asString(payload.nonce);

    // Binds this token to the login attempt this browser started. Without it a
    // token captured from another session could be replayed here.
    if (claimedNonce === null || !constantTimeEquals(claimedNonce, nonce)) {
      throw new OAuthProviderError("id_token_nonce", "Could not verify Google's response.");
    }

    const subject = asString(payload.sub);

    if (subject === null) {
      throw new OAuthProviderError("id_token_subject", "Google did not identify the account.");
    }

    const emailVerified = isVerified(payload.email_verified);

    return {
      provider: "google",
      providerAccountId: subject,
      // Reported only when Google vouched for it. An unverified address never
      // reaches the identity policy as an address at all.
      email: emailVerified ? asString(payload.email) : null,
      emailVerified,
      name: asString(payload.name),
      avatarUrl: asString(payload.picture),
      // The local part of a verified address beats the display name: it is
      // already handle-shaped and far more likely to be unique.
      usernameHint: asString(payload.email)?.split("@")[0] ?? asString(payload.name),
    };
  }

  return {
    provider: "google",
    usesPkce: true,
    usesNonce: true,

    authorizeUrl({ redirectUri, state, nonce, codeChallenge }) {
      const params = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        // Without it Google omits the account chooser for a signed-in user,
        // which makes "link my other Google account" impossible to perform.
        prompt: "select_account",
      });

      return `${AUTHORIZE_URL}?${params.toString()}`;
    },

    async exchange({ code, redirectUri, codeVerifier, nonce }) {
      const response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          code,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!response.ok) {
        throw new OAuthProviderError("token_exchange", "Google rejected the sign-in attempt.");
      }

      const body = (await response.json()) as { id_token?: unknown };
      const idToken = asString(body.id_token);

      if (idToken === null) {
        throw new OAuthProviderError("token_exchange", "Google returned no identity token.");
      }

      // The access token in this response is deliberately ignored and never
      // returned: we call no Google API on the user's behalf, so there is
      // nothing to keep and nowhere in the schema to keep it.
      return verifyIdToken(idToken, nonce);
    },
  };
}
