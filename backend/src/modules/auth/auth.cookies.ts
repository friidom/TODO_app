import type { CookieOptions, Response } from "express";

import { env } from "../../config/env.js";

export const REFRESH_COOKIE = "refresh";

// Path scopes the cookie to the auth routes, so it isn't attached to every
// API call. HttpOnly keeps it out of document.cookie — the reason the access
// token lives in JS memory instead.
const OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  path: "/api/v1/auth",
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...OPTIONS,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

// Every option except maxAge must match the cookie that was set, or the
// browser clears a different cookie and keeps this one.
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, OPTIONS);
}
