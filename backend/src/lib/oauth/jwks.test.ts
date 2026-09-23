import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createRemoteJwks, type FetchLike } from "./jwks.js";

const URL_UNDER_TEST = "https://provider.test/certs";

function jwkFor(kid: string): Record<string, unknown> {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

  return { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
}

interface Stub {
  fetchImpl: FetchLike;
  calls: () => number;
  setKeys: (keys: Record<string, unknown>[]) => void;
  fail: (yes: boolean) => void;
}

function stub(initial: Record<string, unknown>[], maxAge = 3600): Stub {
  let keys = initial;
  let calls = 0;
  let failing = false;

  return {
    calls: () => calls,
    setKeys: (next) => {
      keys = next;
    },
    fail: (yes) => {
      failing = yes;
    },
    fetchImpl: () => {
      calls += 1;

      if (failing) return Promise.reject(new Error("network down"));

      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (name: string) => (name === "cache-control" ? `max-age=${maxAge}` : null) },
        json: () => Promise.resolve({ keys }),
      });
    },
  };
}

describe("createRemoteJwks", () => {
  it("fetches once and serves the cache until max-age expires", async () => {
    const s = stub([jwkFor("k1")]);
    const jwks = createRemoteJwks(URL_UNDER_TEST, s.fetchImpl);

    await jwks.get("k1", 0);
    await jwks.get("k1", 1000);
    await jwks.get("k1", 3_599_000);

    expect(s.calls()).toBe(1);
  });

  it("refetches once max-age has passed", async () => {
    const s = stub([jwkFor("k1")]);
    const jwks = createRemoteJwks(URL_UNDER_TEST, s.fetchImpl);

    await jwks.get("k1", 0);
    await jwks.get("k1", 3_600_001);

    expect(s.calls()).toBe(2);
  });

  // Rotation: a kid we have never seen is the signal to refetch.
  it("refetches for an unknown kid and finds the rotated key", async () => {
    const s = stub([jwkFor("old")]);
    const jwks = createRemoteJwks(URL_UNDER_TEST, s.fetchImpl);

    await jwks.get("old", 0);

    s.setKeys([jwkFor("old"), jwkFor("new")]);

    await expect(jwks.get("new", 61_000)).resolves.toBeDefined();
  });

  // A forged kid must not become one outbound request per callback.
  it("does not refetch for an unknown kid inside the cooldown", async () => {
    const s = stub([jwkFor("k1")]);
    const jwks = createRemoteJwks(URL_UNDER_TEST, s.fetchImpl);

    await jwks.get("k1", 0);

    for (let i = 0; i < 20; i += 1) {
      await expect(jwks.get(`forged-${i}`, 1000 + i)).rejects.toThrow();
    }

    expect(s.calls()).toBe(1);
  });

  // A stale cache still holds cryptographically valid keys; a network blip
  // must not take every Google sign-in down with it.
  it("serves a stale key when the refresh fails", async () => {
    const s = stub([jwkFor("k1")]);
    const jwks = createRemoteJwks(URL_UNDER_TEST, s.fetchImpl);

    await jwks.get("k1", 0);

    s.fail(true);

    await expect(jwks.get("k1", 3_600_001)).resolves.toBeDefined();
  });

  it("still fails when there is nothing cached to fall back on", async () => {
    const s = stub([jwkFor("k1")]);

    s.fail(true);

    const jwks = createRemoteJwks(URL_UNDER_TEST, s.fetchImpl);

    await expect(jwks.get("k1", 0)).rejects.toThrow();
  });

  it("rejects a malformed document", async () => {
    const jwks = createRemoteJwks(URL_UNDER_TEST, () =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ notKeys: [] }),
      }),
    );

    await expect(jwks.get("k1", 0)).rejects.toThrow();
  });

  it("rejects when the endpoint refuses", async () => {
    const jwks = createRemoteJwks(URL_UNDER_TEST, () =>
      Promise.resolve({
        ok: false,
        status: 503,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      }),
    );

    await expect(jwks.get("k1", 0)).rejects.toThrow();
  });

  // Pinned because accepting whatever the document carries is how an
  // unexpected algorithm becomes a verification bypass.
  it("ignores entries that are not RS256 RSA keys", async () => {
    const jwks = createRemoteJwks(URL_UNDER_TEST, () =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () =>
          Promise.resolve({
            keys: [
              { kid: "hmac", kty: "oct", alg: "HS256", k: "c2VjcmV0" },
              { ...jwkFor("es"), kty: "EC", alg: "ES256" },
            ],
          }),
      }),
    );

    await expect(jwks.get("hmac", 0)).rejects.toThrow();
    await expect(jwks.get("es", 0)).rejects.toThrow();
  });
});
