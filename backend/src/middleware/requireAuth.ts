import type { NextFunction, Request, Response } from "express";

import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";

const BEARER = "Bearer ";

// Stateless: no sessions lookup. Logout and deactivation only take effect on
// the access token when it expires — the refresh token is revoked
// immediately, so exposure is bounded by ACCESS_TOKEN_TTL.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (header === undefined || !header.startsWith(BEARER)) {
    next(new AppError("unauthorized", "Not authenticated."));

    return;
  }

  try {
    const { userId } = verifyAccessToken(header.slice(BEARER.length));

    req.actor = { id: userId };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireActor(req: Request): string {
  if (req.actor === undefined) {
    // Reaching here without requireAuth in front is a wiring bug, not a
    // client error — it must not read as a 401.
    throw new AppError("internal", "Internal server error");
  }

  return req.actor.id;
}
