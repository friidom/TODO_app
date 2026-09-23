import type { Request } from "express";
import rateLimit, { type Options } from "express-rate-limit";

import { AppError } from "../lib/errors.js";
import { normalizeIdentifier } from "../lib/identifier.js";

const MINUTE = 60_000;

function limiter(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError("too_many_requests", "Too many attempts. Try again later."));
    },
    ...options,
  });
}

export const loginIpLimiter = limiter({ windowMs: 15 * MINUTE, limit: 40 });

// Per-account, so spraying one password across many accounts (caught by the
// IP limiter) and guessing one account's password from many IPs are both
// covered. skipSuccessfulRequests keeps a shared office IP from locking itself
// out on its own successful logins.
export const loginAccountLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => {
    const identifier = (req.body as { identifier?: unknown } | undefined)?.identifier;

    // Lowercased because users.email is citext: without it, ada@x.com and
    // Ada@x.com are one account but two buckets, and case variation walks
    // straight around this limit.
    return typeof identifier === "string"
      ? normalizeIdentifier(identifier).value.toLowerCase()
      : "anonymous";
  },
});

export const registerLimiter = limiter({ windowMs: 60 * MINUTE, limit: 10 });

export const forgotPasswordIpLimiter = limiter({ windowMs: 60 * MINUTE, limit: 10 });

// Keyed by address too: /password/forgot always answers 200, so without this
// it's a free mail cannon aimed at one inbox.
export const forgotPasswordAddressLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 3,
  keyGenerator: (req: Request) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;

    return typeof email === "string" ? email.trim().toLowerCase() : "anonymous";
  },
});

export const resetPasswordLimiter = limiter({ windowMs: 60 * MINUTE, limit: 20 });

export const usernameAvailableLimiter = limiter({ windowMs: 5 * MINUTE, limit: 60 });

export const refreshLimiter = limiter({ windowMs: 15 * MINUTE, limit: 120 });

// ALL THREE ARE ONE GLOBAL BUCKET behind nginx, because `trust proxy` is unset
// (B12-03) and every proxied request presents the same container IP. The limits
// are therefore sized as "absurd for a whole deployment" rather than "generous
// for one person" — too tight here is an outage, not a defence.
//
// skipSuccessfulRequests is deliberately NOT used on any of them: these routes
// answer 302 on success AND on every handled failure, and express-rate-limit
// counts anything under 400 as successful, so it would skip essentially every
// request and leave the limiter decorative.

// Mints a signed cookie and redirects. No database and no outbound call, so
// the only thing being bounded is nuisance.
export const oauthStartLimiter = limiter({ windowMs: 15 * MINUTE, limit: 300 });

// The one that matters: unauthenticated AND it makes outbound calls to the
// provider, so without a limit it is a free request amplifier pointed at
// Google and GitHub.
// 300, not 120: at one global bucket this is the number of sign-ins the WHOLE
// deployment gets per window, and an unauthenticated caller can spend it to
// deny OAuth to everyone. Keying per client needs `trust proxy` (B12-03);
// until then the limit is sized so casual abuse cannot lock a team out, while
// still bounding the outbound calls this route makes.
export const oauthCallbackLimiter = limiter({ windowMs: 15 * MINUTE, limit: 300 });

// Guessing a link token means guessing 256 bits, so this bounds cost rather
// than reachability.
export const oauthLinkLimiter = limiter({ windowMs: 15 * MINUTE, limit: 120 });
