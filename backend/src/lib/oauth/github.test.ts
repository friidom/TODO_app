import { describe, expect, it } from "vitest";

import { createGitHubAdapter, primaryVerifiedEmail } from "./github.js";
import type { FetchLike } from "./jwks.js";

const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const EMAILS_URL = "https://api.github.com/user/emails";

function json(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  });
}

interface Stub {
  token?: unknown;
  tokenOk?: boolean;
  user?: unknown;
  userOk?: boolean;
  emails?: unknown;
  emailsOk?: boolean;
}

function routes(stub: Stub): { fetchImpl: FetchLike; seen: string[] } {
  const seen: string[] = [];

  const fetchImpl: FetchLike = (url) => {
    seen.push(url);

    if (url === TOKEN_URL) {
      return json(stub.token ?? { access_token: "gho_test" }, stub.tokenOk ?? true);
    }

    if (url === USER_URL) return json(stub.user ?? { id: 4242, login: "ada" }, stub.userOk ?? true);

    if (url === EMAILS_URL) return json(stub.emails ?? [], stub.emailsOk ?? true);

    throw new Error(`unexpected url ${url}`);
  };

  return { fetchImpl, seen };
}

function exchange(stub: Stub) {
  const { fetchImpl, seen } = routes(stub);

  const result = createGitHubAdapter({
    clientId: "id",
    clientSecret: "secret",
    fetchImpl,
  }).exchange({
    code: "code-1",
    redirectUri: "https://api.test/auth/oauth/github/callback",
    codeVerifier: "",
    nonce: "",
  });

  return { result, seen };
}

describe("primaryVerifiedEmail", () => {
  it("takes the primary AND verified entry", () => {
    expect(
      primaryVerifiedEmail([
        { email: "alt@example.test", primary: false, verified: true },
        { email: "ada@example.test", primary: true, verified: true },
      ]),
    ).toBe("ada@example.test");
  });

  // The whole GitHub takeover story: an attacker can set an unverified address
  // to anything, including somebody else's.
  it("ignores a primary address GitHub has not verified", () => {
    expect(primaryVerifiedEmail([{ email: "victim@corp.test", primary: true, verified: false }])).toBeNull();
  });

  it("ignores a verified address that is not primary", () => {
    expect(primaryVerifiedEmail([{ email: "alt@example.test", primary: false, verified: true }])).toBeNull();
  });

  it("returns null for an empty list or a non-list", () => {
    expect(primaryVerifiedEmail([])).toBeNull();
    expect(primaryVerifiedEmail(null)).toBeNull();
    expect(primaryVerifiedEmail({ email: "x@y.test" })).toBeNull();
  });
});

describe("github adapter", () => {
  it("identifies the account by numeric id, not by login", async () => {
    const { result } = exchange({
      user: { id: 4242, login: "ada", name: "Ada L", avatar_url: "https://avatars/1" },
      emails: [{ email: "ada@example.test", primary: true, verified: true }],
    });

    const identity = await result;

    expect(identity.providerAccountId).toBe("4242");
    expect(identity.providerAccountId).not.toBe("ada");
    expect(identity.usernameHint).toBe("ada");
  });

  // THE regression test for this provider. /user.email is attacker-settable;
  // only /user/emails is vouched for.
  it("never trusts /user.email, even when /user/emails disagrees", async () => {
    const { result, seen } = exchange({
      user: { id: 7, login: "mallory", email: "victim@corp.test" },
      emails: [{ email: "mallory@example.test", primary: true, verified: true }],
    });

    const identity = await result;

    expect(identity.email).toBe("mallory@example.test");
    expect(identity.email).not.toBe("victim@corp.test");
    expect(seen).toContain(EMAILS_URL);
  });

  it("reports no email when nothing is primary and verified", async () => {
    const identity = await exchange({
      user: { id: 7, login: "ghost", email: "public@example.test" },
      emails: [{ email: "public@example.test", primary: true, verified: false }],
    }).result;

    expect(identity.email).toBeNull();
    expect(identity.emailVerified).toBe(false);
  });

  it("keeps email and emailVerified in agreement", async () => {
    for (const emails of [
      [],
      [{ email: "a@b.test", primary: true, verified: true }],
      [{ email: "a@b.test", primary: true, verified: false }],
    ]) {
      const identity = await exchange({ emails }).result;

      expect(identity.emailVerified).toBe(identity.email !== null);
    }
  });

  // GitHub answers 200 with an `error` body rather than a 4xx for a spent code.
  it("rejects a 200 response that carries no access token", async () => {
    await expect(exchange({ token: { error: "bad_verification_code" } }).result).rejects.toThrow();
  });

  it("rejects when the token endpoint refuses", async () => {
    await expect(exchange({ tokenOk: false }).result).rejects.toThrow();
  });

  it("rejects when /user cannot be read", async () => {
    await expect(exchange({ userOk: false }).result).rejects.toThrow();
  });

  it("rejects a user payload with no id", async () => {
    await expect(exchange({ user: { login: "ada" } }).result).rejects.toThrow();
  });

  describe("authorizeUrl", () => {
    it("asks for the verified-email scope and sends no PKCE", () => {
      const adapter = createGitHubAdapter({ clientId: "id", clientSecret: "s" });

      const url = new URL(
        adapter.authorizeUrl({
          redirectUri: "https://api.test/auth/oauth/github/callback",
          state: "state-1",
          nonce: "",
          codeChallenge: "",
        }),
      );

      expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
      expect(url.searchParams.get("scope")).toBe("read:user user:email");
      expect(url.searchParams.get("state")).toBe("state-1");
      expect(url.searchParams.has("code_challenge")).toBe(false);
      expect(url.searchParams.has("nonce")).toBe(false);
      expect(adapter.usesPkce).toBe(false);
      expect(adapter.usesNonce).toBe(false);
    });
  });
});
