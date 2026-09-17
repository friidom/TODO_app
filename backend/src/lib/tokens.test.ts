import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import {
  mintOpaqueToken,
  refreshTokenExpiry,
  sha256,
  signAccessToken,
  verifyAccessToken,
} from "./tokens.js";

const USER_ID = randomUUID();

describe("access tokens", () => {
  it("round-trips the subject", () => {
    const { accessToken } = signAccessToken(USER_ID);

    expect(verifyAccessToken(accessToken).userId).toBe(USER_ID);
  });

  it("carries a unique jti and no role claim", () => {
    const first = verifyAccessToken(signAccessToken(USER_ID).accessToken);
    const second = verifyAccessToken(signAccessToken(USER_ID).accessToken);

    expect(first.jti).not.toBe(second.jti);

    const payload = jwt.decode(signAccessToken(USER_ID).accessToken) as Record<string, unknown>;

    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("roles");
  });

  it("expires after ACCESS_TOKEN_TTL", () => {
    const payload = jwt.decode(signAccessToken(USER_ID).accessToken) as {
      iat: number;
      exp: number;
    };

    expect(payload.exp - payload.iat).toBe(env.ACCESS_TOKEN_TTL);
  });

  it("rejects a tampered token", () => {
    const { accessToken } = signAccessToken(USER_ID);
    const [header, body] = accessToken.split(".");
    const forged = `${header}.${body}.${"a".repeat(43)}`;

    expect(() => verifyAccessToken(forged)).toThrow(AppError);
  });

  it("rejects an unsigned alg:none token", () => {
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    )}.${Buffer.from(JSON.stringify({ sub: USER_ID, jti: randomUUID() })).toString("base64url")}.`;

    expect(() => verifyAccessToken(unsigned)).toThrow(AppError);
  });

  it("rejects a token signed with another secret", () => {
    const foreign = jwt.sign({}, "a-different-secret-of-sufficient-length", {
      algorithm: "HS256",
      subject: USER_ID,
      jwtid: randomUUID(),
      expiresIn: 900,
    });

    expect(() => verifyAccessToken(foreign)).toThrow(AppError);
  });

  it("rejects a token that verifies but carries no subject", () => {
    const subjectless = jwt.sign({}, env.JWT_SECRET, {
      algorithm: "HS256",
      jwtid: randomUUID(),
      expiresIn: 900,
    });

    expect(() => verifyAccessToken(subjectless)).toThrow(AppError);
  });

  it("fails as a 401 rather than a 500", () => {
    try {
      verifyAccessToken("nonsense");
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).status).toBe(401);
    }
  });
});

describe("opaque tokens", () => {
  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => mintOpaqueToken().token));

    expect(tokens.size).toBe(100);
  });

  it("hashes to something that is not the token", () => {
    const { token, tokenHash } = mintOpaqueToken();

    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toBe(sha256(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("carries enough entropy to be unguessable", () => {
    expect(mintOpaqueToken().token).toHaveLength(43); // 32 bytes, base64url, no padding
  });
});

describe("refreshTokenExpiry", () => {
  it("is REFRESH_TOKEN_TTL_DAYS ahead of its starting point", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const days = (refreshTokenExpiry(from).getTime() - from.getTime()) / 86_400_000;

    expect(days).toBe(env.REFRESH_TOKEN_TTL_DAYS);
  });
});
