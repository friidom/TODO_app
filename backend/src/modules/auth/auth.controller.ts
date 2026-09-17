import { isIP } from "node:net";

import type { Request, RequestHandler, Response } from "express";

import { toAppError } from "../../lib/errors.js";
import { requireActor } from "../../middleware/requireAuth.js";
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from "./auth.cookies.js";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  registerSchema,
  resetPasswordSchema,
  usernameAvailableSchema,
} from "./auth.schema.js";
import * as authService from "./auth.service.js";
import type { AuthResult, RequestMeta } from "./auth.service.js";

function metaOf(req: Request): RequestMeta {
  const ip = req.ip;

  return {
    userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
    // sessions.ip is inet; an unparseable value is left null rather than
    // failing the login.
    ip: ip !== undefined && isIP(ip) !== 0 ? ip : null,
  };
}

function refreshTokenOf(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];

  return typeof value === "string" ? value : undefined;
}

function sendSession(res: Response, result: AuthResult, status: number): void {
  if (result.needsVerification) {
    res.status(status).json({ user: result.user, needsVerification: true });

    return;
  }

  setRefreshCookie(res, result.refreshToken);

  res.status(status).json({
    user: result.user,
    needsVerification: false,
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
  });
}

export const register: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);

  sendSession(res, await authService.register(input, metaOf(req)), 201);
};

export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);

  sendSession(res, await authService.login(input, metaOf(req)), 200);
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    const result = await authService.refresh(refreshTokenOf(req), metaOf(req));

    setRefreshCookie(res, result.refreshToken);

    res.json({
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    // Only when the token itself is dead. Clearing on a transient 500 would
    // destroy a session that is still perfectly valid.
    if (toAppError(error).status === 401) clearRefreshCookie(res);

    throw error;
  }
};

export const logout: RequestHandler = async (req, res) => {
  const { all } = logoutSchema.parse(req.query);

  await authService.logout(refreshTokenOf(req), all === "true");

  clearRefreshCookie(res);

  res.status(204).end();
};

export const me: RequestHandler = async (req, res) => {
  res.json({ user: await authService.me(requireActor(req)) });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);

  await authService.forgotPassword(email);

  res.json({ ok: true });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);

  await authService.resetPassword(input);

  // No session issued: signing in here would make the reset link itself a
  // login link.
  res.json({ ok: true });
};

export const usernameAvailable: RequestHandler = async (req, res) => {
  const { username } = usernameAvailableSchema.parse(req.query);

  res.json({ available: await authService.usernameAvailable(username) });
};
