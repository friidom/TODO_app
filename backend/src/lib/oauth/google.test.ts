import { generateKeyPairSync, type KeyObject } from "node:crypto";

import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it } from "vitest";

import { createGoogleAdapter } from "./google.js";
import type { FetchLike } from "./jwks.js";

const CLIENT_ID = "client-123.apps.googleusercontent.com";
const KID = "test-key";
const NONCE = "nonce-abc";
const NOW = 1_700_000_000_000;

let privateKey: KeyObject;
let publicKey: KeyObject;

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });

  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
});

function sign(
  payload: Record<string, unknown>,
  options: { aud?: string; iss?: string; expiresIn?: number; kid?: string } = {},
): string {
  return jwt.sign({ nonce: NONCE, ...payload }, privateKey, {
    algorithm: "RS256",
    keyid: options.kid ?? KID,
    audience: options.aud ?? CLIENT_ID,
    issuer: options.iss ?? "https://accounts.google.com",
    expiresIn: options.expiresIn ?? 600,
  });
}

// A JWKS that always answers with the one key, so these tests exercise the
// verification rules rather than the cache.
const jwks = {
  get(kid: string): Promise<KeyObject> {
    if (kid !== KID) return Promise.reject(new Error("unknown kid"));

    return Promise.resolve(publicKey);
  },
};

function adapter(fetchImpl?: FetchLike) {
  return createGoogleAdapter({
    clientId: CLIENT_ID,
    clientSecret: "secret",
    jwks,
    now: () => NOW,
    fetchImpl: fetchImpl ?? ((() => Promise.reject(new Error("no fetch"))) as unknown as FetchLike),
  });
}

// Stands in for the token endpoint, handing back whatever id_token the test
// wants to put in front of the verifier.
function tokenEndpoint(idToken: unknown, ok = true): FetchLike {
  return () =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 400,
      headers: { get: () => null },
      json: () => Promise.resolve({ id_token: idToken }),
    });
}

function exchange(idToken: unknown, nonce = NONCE) {
  return adapter(tokenEndpoint(idToken)).exchange({
    code: "code-1",
    redirectUri: "https://api.test/auth/oauth/google/callback",
    codeVerifier: "verifier",
    nonce,
  });
}

describe("google adapter", () => {
  it("accepts a well-formed id token and reads the subject", async () => {
    const identity = await exchange(
      sign({ sub: "google-sub-1", email: "ada@example.test", email_verified: true, name: "Ada" }),
    );

    expect(identity).toMatchObject({
      provider: "google",
      providerAccountId: "google-sub-1",
      email: "ada@example.test",
      emailVerified: true,
      name: "Ada",
    });
  });

  // Without the audience check, an id token Google minted for ANY other
  // application would authenticate somebody here.
  it("rejects a token minted for a different audience", async () => {
    await expect(exchange(sign({ sub: "s" }, { aud: "someone-elses-client" }))).rejects.toThrow();
  });

  it("rejects a token from a different issuer", async () => {
    await expect(exchange(sign({ sub: "s" }, { iss: "https://evil.test" }))).rejects.toThrow();
  });

  it("accepts both issuer spellings Google emits", async () => {
    for (const iss of ["https://accounts.google.com", "accounts.google.com"]) {
      const identity = await exchange(sign({ sub: "s", email_verified: true }, { iss }));

      expect(identity.providerAccountId).toBe("s");
    }
  });

  it("rejects an expired token", async () => {
    await expect(exchange(sign({ sub: "s" }, { expiresIn: -3600 }))).rejects.toThrow();
  });

  // Binds the token to the attempt this browser started.
  it("rejects a mismatched nonce", async () => {
    await expect(exchange(sign({ sub: "s" }), "a-different-nonce")).rejects.toThrow();
  });

  it("rejects a token carrying no nonce", async () => {
    const noNonce = jwt.sign({ sub: "s" }, privateKey, {
      algorithm: "RS256",
      keyid: KID,
      audience: CLIENT_ID,
      issuer: "https://accounts.google.com",
      expiresIn: 600,
    });

    await expect(exchange(noNonce)).rejects.toThrow();
  });

  it("rejects an unsigned alg:none token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", kid: KID })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "s", aud: CLIENT_ID, iss: "https://accounts.google.com", nonce: NONCE }),
    ).toString("base64url");

    await expect(exchange(`${header}.${payload}.`)).rejects.toThrow();
  });

  it("rejects a token signed with an unknown key", async () => {
    await expect(exchange(sign({ sub: "s" }, { kid: "rotated-away" }))).rejects.toThrow();
  });

  it("rejects a response with no id token at all", async () => {
    await expect(exchange(undefined)).rejects.toThrow();
  });

  it("rejects when the token endpoint refuses", async () => {
    const failing = adapter(tokenEndpoint(sign({ sub: "s" }), false));

    await expect(
      failing.exchange({
        code: "c",
        redirectUri: "https://api.test/cb",
        codeVerifier: "v",
        nonce: NONCE,
      }),
    ).rejects.toThrow();
  });

  describe("email_verified", () => {
    it("drops the address when Google did not verify it", async () => {
      const identity = await exchange(
        sign({ sub: "s", email: "unverified@example.test", email_verified: false }),
      );

      expect(identity.email).toBeNull();
      expect(identity.emailVerified).toBe(false);
    });

    it("drops the address when the claim is absent", async () => {
      const identity = await exchange(sign({ sub: "s", email: "nobody@example.test" }));

      expect(identity.email).toBeNull();
      expect(identity.emailVerified).toBe(false);
    });

    // Google has emitted this as a string historically.
    it('accepts the string "true"', async () => {
      const identity = await exchange(
        sign({ sub: "s", email: "ada@example.test", email_verified: "true" }),
      );

      expect(identity.email).toBe("ada@example.test");
      expect(identity.emailVerified).toBe(true);
    });
  });

  describe("authorizeUrl", () => {
    it("asks for PKCE, a nonce and the openid scope", () => {
      const url = new URL(
        adapter().authorizeUrl({
          redirectUri: "https://api.test/auth/oauth/google/callback",
          state: "state-1",
          nonce: NONCE,
          codeChallenge: "challenge-1",
        }),
      );

      expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
      expect(url.searchParams.get("state")).toBe("state-1");
      expect(url.searchParams.get("nonce")).toBe(NONCE);
      expect(url.searchParams.get("scope")).toBe("openid email profile");
      expect(url.searchParams.get("response_type")).toBe("code");
    });
  });
});
