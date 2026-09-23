import { createHash } from "node:crypto";

import type { Request } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { env } from "../../config/env.js";
import { mintTransaction, OAUTH_COOKIE, pkceChallenge, readTransaction } from "./oauth.state.js";

function requestWith(cookie: unknown): Request {
  return { cookies: { [OAUTH_COOKIE]: cookie } } as unknown as Request;
}

function mint(over: Parameters<typeof mintTransaction>[0]) {
  return mintTransaction(over);
}

const LOGIN = { provider: "google", next: null, mode: "login", linkUserId: null } as const;

describe("pkceChallenge", () => {
  // S256 is BASE64URL(SHA256(ASCII(verifier))) — asserted against an
  // independently computed digest rather than a hard-coded string.
  it("is the base64url sha256 of the verifier", () => {
    const verifier = "a-test-verifier";

    expect(pkceChallenge(verifier)).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
  });

  it("is url-safe", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(pkceChallenge(`verifier-${i}`)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("mintTransaction", () => {
  it("issues distinct high-entropy values each time", () => {
    const a = mint({ ...LOGIN });
    const b = mint({ ...LOGIN });

    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier).not.toBe(b.verifier);
    // 32 random bytes in base64url.
    expect(a.state.length).toBeGreaterThanOrEqual(43);
  });

  it("does not put the state or verifier anywhere but the signed cookie", () => {
    const minted = mint({ ...LOGIN });
    const decoded = jwt.decode(minted.token) as Record<string, unknown>;

    expect(decoded.state).toBe(minted.state);
    expect(decoded.verifier).toBe(minted.verifier);
  });
});

describe("readTransaction", () => {
  it("round-trips a freshly minted transaction", () => {
    const minted = mint({ ...LOGIN, next: "/boards/x" });

    const tx = readTransaction(requestWith(minted.token), "google", minted.state);

    expect(tx).toMatchObject({
      provider: "google",
      state: minted.state,
      verifier: minted.verifier,
      nonce: minted.nonce,
      next: "/boards/x",
      mode: "login",
      linkUserId: null,
    });
  });

  it("carries the link target through", () => {
    const minted = mint({ provider: "github", next: null, mode: "link", linkUserId: "user-1" });

    expect(readTransaction(requestWith(minted.token), "github", minted.state)).toMatchObject({
      mode: "link",
      linkUserId: "user-1",
    });
  });

  // This is the CSRF check: an attacker delivering their own authorization code
  // to the victim's callback has no way to also produce a matching state.
  it("refuses a state the cookie does not agree with", () => {
    const minted = mint({ ...LOGIN });

    expect(readTransaction(requestWith(minted.token), "google", "not-the-state")).toBeNull();
    expect(readTransaction(requestWith(minted.token), "google", "")).toBeNull();
  });

  it("refuses a cookie minted for a different provider", () => {
    const minted = mint({ ...LOGIN });

    expect(readTransaction(requestWith(minted.token), "github", minted.state)).toBeNull();
  });

  it("refuses a tampered or unsigned cookie", () => {
    const minted = mint({ ...LOGIN });

    const [header, payload] = minted.token.split(".");

    expect(readTransaction(requestWith(`${minted.token}x`), "google", minted.state)).toBeNull();
    expect(readTransaction(requestWith(`${header}.${payload}.`), "google", minted.state)).toBeNull();
  });

  it("refuses a cookie signed with someone else's secret", () => {
    const forged = jwt.sign(
      { provider: "google", state: "s", verifier: "v", nonce: "n", next: null, mode: "login", linkUserId: "victim" },
      "a-different-secret-that-is-long-enough",
      { algorithm: "HS256", expiresIn: 600 },
    );

    expect(readTransaction(requestWith(forged), "google", "s")).toBeNull();
  });

  it("refuses an expired cookie", () => {
    const expired = jwt.sign(
      { provider: "google", state: "s", verifier: "v", nonce: "n", next: null, mode: "login", linkUserId: null },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: -60 },
    );

    expect(readTransaction(requestWith(expired), "google", "s")).toBeNull();
  });

  it("refuses a missing cookie", () => {
    expect(readTransaction(requestWith(undefined), "google", "s")).toBeNull();
    expect(readTransaction({ cookies: undefined } as unknown as Request, "google", "s")).toBeNull();
    expect(readTransaction(requestWith(""), "google", "s")).toBeNull();
  });
});
