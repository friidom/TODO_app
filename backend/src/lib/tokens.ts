import { createHash, randomBytes, randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export interface AccessTokenClaims {
  userId: string;
  jti: string;
}

// No role claim: roles are per board and change, and one baked into a
// 15-minute token means a demotion takes 15 minutes to bite. Membership is
// read per request instead (B6).
export function signAccessToken(userId: string): { accessToken: string; expiresIn: number } {
  const accessToken = jwt.sign({}, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: userId,
    jwtid: randomUUID(),
    expiresIn: env.ACCESS_TOKEN_TTL,
  });

  return { accessToken, expiresIn: env.ACCESS_TOKEN_TTL };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  let payload: string | jwt.JwtPayload;

  try {
    // algorithms pinned: without it a token carrying alg:"none", or one
    // signed RS256 and verified against our HMAC secret as a public key,
    // would be accepted.
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    throw new AppError("unauthorized", "Not authenticated.");
  }

  if (typeof payload === "string" || !payload.sub || !payload.jti) {
    throw new AppError("unauthorized", "Not authenticated.");
  }

  return { userId: payload.sub, jti: payload.jti };
}

export function mintOpaqueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");

  return { token, tokenHash: sha256(token) };
}

// sha256, not argon2: these are 256-bit random values with no dictionary to
// stretch against, so a plain hash already renders a stolen row useless.
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function refreshTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
}
