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
