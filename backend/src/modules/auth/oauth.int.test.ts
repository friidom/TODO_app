import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import type { OAuthProvider, ProviderAdapter, ProviderIdentity } from "../../lib/oauth/identity.js";
import { clearRegisteredAdapters, registerAdapter } from "../../lib/oauth/providers.js";
import * as oauthRepo from "./oauth.repo.js";
import { sha256 } from "../../lib/tokens.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;

// What the fake provider will hand back from its next exchange().
let nextIdentity: ProviderIdentity | Error;

function identityOf(over: Partial<ProviderIdentity> = {}): ProviderIdentity {
  return {
    provider: "google",
    providerAccountId: "sub-1",
    email: "ada@example.test",
    emailVerified: true,
    name: "Ada",
    avatarUrl: null,
    usernameHint: "ada",
    ...over,
  };
}

function fakeAdapter(provider: OAuthProvider): ProviderAdapter {
  return {
    provider,
    usesPkce: false,
    usesNonce: false,
    authorizeUrl: ({ state }) => `https://provider.test/authorize?state=${encodeURIComponent(state)}`,
    exchange: () =>
      nextIdentity instanceof Error ? Promise.reject(nextIdentity) : Promise.resolve(nextIdentity),
  };
}

// The shared TestClient follows redirects, which would send every assertion off
// to APP_URL. These routes answer 302 and the Location IS the result, so they
// need their own manual-redirect fetch.
async function raw(
  path: string,
  init: { cookie?: string; token?: string; method?: string; body?: unknown } = {},
): Promise<{ status: number; location: string | null; cookies: string[]; body: unknown }> {
  const headers: Record<string, string> = {};

  if (init.cookie !== undefined) headers.cookie = init.cookie;
  if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${client.url}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: "manual",
  });

  const text = await response.text();

  return {
    status: response.status,
    location: response.headers.get("location"),
    cookies: response.headers.getSetCookie(),
    // A 302 answers with express's own "Found. Redirecting to ..." HTML, so
    // the body is only sometimes JSON — the Location header is the result on
    // those routes.
    body: text === "" ? undefined : safeParse(text),
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function cookieValue(cookies: string[], name: string): string | null {
  for (const raw of cookies) {
    const [pair] = raw.split(";");
    const [key, ...rest] = pair.split("=");

    if (key.trim() === name) return rest.join("=");
  }

  return null;
}

// Walks the real two-leg flow: /start mints the cookie and the state, and the
// state is read back out of the authorize URL exactly as a provider would echo
// it.
async function signInWith(
  provider: OAuthProvider,
  identity: ProviderIdentity | Error,
  options: { cookie?: string; state?: string } = {},
) {
  nextIdentity = identity;

  const started = await raw(`/api/v1/auth/oauth/${provider}/start`);
  const cookie = options.cookie ?? `oauth_tx=${cookieValue(started.cookies, "oauth_tx")}`;
  const state =
    options.state ?? new URL(started.location as string).searchParams.get("state") ?? "";

  return raw(
    `/api/v1/auth/oauth/${provider}/callback?code=test-code&state=${encodeURIComponent(state)}`,
    { cookie },
  );
}

// Proves the whole chain: the callback's refresh cookie is spent through the
// ordinary /auth/refresh route, exactly as the browser does after the redirect.
async function accessTokenFrom(callback: { cookies: string[] }): Promise<string> {
  const refresh = cookieValue(callback.cookies, "refresh");

  const refreshed = await raw("/api/v1/auth/refresh", {
    method: "POST",
    cookie: `refresh=${refresh}`,
  });

  return (refreshed.body as { accessToken: string }).accessToken;
}

function userCount(): Promise<number> {
  return prisma.users.count();
}

beforeAll(async () => {
  client = await startTestServer();

  registerAdapter("google", fakeAdapter("google"));
  registerAdapter("github", fakeAdapter("github"));
});

afterAll(async () => {
  clearRegisteredAdapters();
  await client.close();
  await disconnect();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("oauth sign-in", () => {
  it("provisions a whole account for a new identity", async () => {
    const result = await signInWith("google", identityOf());

    expect(result.status).toBe(302);
    expect(result.location).toBe("http://frontend.test/");
    expect(cookieValue(result.cookies, "refresh")).toBeTruthy();

    const user = await prisma.users.findFirstOrThrow({
      include: { profiles: true, oauth_accounts: true },
    });

    expect(await userCount()).toBe(1);
    expect(user.email).toBe("ada@example.test");
    // The provider vouched for the address, so the account is not left in a
    // state where adding a password would silently lock it out.
    expect(user.email_verified_at).not.toBeNull();
    expect(user.password_hash).toBeNull();
    expect(user.profiles?.username).toBe("ada");
    expect(user.oauth_accounts).toHaveLength(1);
    expect(user.oauth_accounts[0]).toMatchObject({
      provider: "google",
      provider_account_id: "sub-1",
      provider_email: "ada@example.test",
      provider_email_verified: true,
    });

    expect(await prisma.boards.count({ where: { owner_id: user.id } })).toBe(1);

    const board = await prisma.boards.findFirstOrThrow({ where: { owner_id: user.id } });

    expect(await prisma.columns.count({ where: { board_id: board.id } })).toBe(4);
  });

  it("issues a usable session through the ordinary refresh route", async () => {
    const result = await signInWith("google", identityOf());
    const token = await accessTokenFrom(result);

    const me = await raw("/api/v1/auth/me", { token });

    expect(me.status).toBe(200);
    expect((me.body as { user: { email: string } }).user.email).toBe("ada@example.test");
  });

  it("puts no token in the redirect URL", async () => {
    const result = await signInWith("google", identityOf());

    expect(result.location).not.toMatch(/token|jwt|code=/i);
  });

  it("honours a safe ?next and ignores a hostile one", async () => {
    nextIdentity = identityOf();

    for (const [next, expected] of [
      ["/boards/abc", "http://frontend.test/boards/abc"],
      ["//evil.test", "http://frontend.test/"],
      ["https://evil.test", "http://frontend.test/"],
    ] as const) {
      await resetDatabase();

      const started = await raw(
        `/api/v1/auth/oauth/google/start?next=${encodeURIComponent(next)}`,
      );
      const state = new URL(started.location as string).searchParams.get("state") ?? "";

      const result = await raw(
        `/api/v1/auth/oauth/google/callback?code=c&state=${encodeURIComponent(state)}`,
        { cookie: `oauth_tx=${cookieValue(started.cookies, "oauth_tx")}` },
      );

      expect(result.location, next).toBe(expected);
    }
  });

  // R1
  it("signs the same identity into the same account twice", async () => {
    await signInWith("google", identityOf());
    const second = await signInWith("google", identityOf());

    expect(second.status).toBe(302);
    expect(second.location).toBe("http://frontend.test/");
    expect(await userCount()).toBe(1);
    expect(await prisma.oauth_accounts.count()).toBe(1);
    // A second sign-in is a second session, never a second account.
    expect(await prisma.sessions.count()).toBe(2);
  });

  // R1: the identity is the key, so a changed address is not a new person.
  it("follows the identity when the provider reports a new address", async () => {
    await signInWith("google", identityOf());
    await signInWith("google", identityOf({ email: "ada.new@example.test" }));

    expect(await userCount()).toBe(1);

    const user = await prisma.users.findFirstOrThrow();

    // users.email is the account's own address and is NOT rewritten by a
    // provider; only the display copy follows.
    expect(user.email).toBe("ada@example.test");
    expect((await prisma.oauth_accounts.findFirstOrThrow()).provider_email).toBe(
      "ada.new@example.test",
    );
  });

  // R3, Case 5
  it("creates separate accounts for two providers with different addresses", async () => {
    await signInWith("google", identityOf());
    await signInWith("github", identityOf({ provider: "github", providerAccountId: "gh-1", email: "other@example.test" }));

    expect(await userCount()).toBe(2);
  });

  // R2
  it("refuses an unverified address and creates nothing", async () => {
    const result = await signInWith(
      "github",
      identityOf({ provider: "github", providerAccountId: "gh-1", emailVerified: false }),
    );

    expect(result.status).toBe(302);
    expect(result.location).toBe("http://frontend.test/login?error=email_unverified");
    expect(await userCount()).toBe(0);
    expect(cookieValue(result.cookies, "refresh")).toBeNull();
  });

  it("refuses an identity with no address at all", async () => {
    const result = await signInWith(
      "github",
      identityOf({ provider: "github", providerAccountId: "gh-1", email: null, emailVerified: false }),
    );

    expect(result.location).toContain("error=");
    expect(await userCount()).toBe(0);
  });

  it("refuses a deactivated account", async () => {
    await signInWith("google", identityOf());
    await prisma.users.updateMany({ data: { deactivated_at: new Date() } });

    const result = await signInWith("google", identityOf());

    expect(result.location).toBe("http://frontend.test/login?error=account_disabled");
    expect(cookieValue(result.cookies, "refresh")).toBeNull();
  });

  it("refuses a state the cookie does not agree with", async () => {
    const result = await signInWith("google", identityOf(), { state: "forged-state" });

    expect(result.location).toBe("http://frontend.test/login?error=invalid_state");
    expect(await userCount()).toBe(0);
  });

  it("refuses a callback with no transaction cookie", async () => {
    const result = await signInWith("google", identityOf(), { cookie: "" });

    expect(result.location).toBe("http://frontend.test/login?error=invalid_state");
    expect(await userCount()).toBe(0);
  });

  it("redirects rather than 400s on an unknown provider", async () => {
    const result = await raw("/api/v1/auth/oauth/myspace/start");

    expect(result.status).toBe(302);
    expect(result.location).toContain("/login?error=");
  });

  it("reports the provider's refusal without echoing its text", async () => {
    const result = await raw(
      "/api/v1/auth/oauth/google/callback?error=access_denied&error_description=nope",
    );

    expect(result.location).toBe("http://frontend.test/login?error=provider_denied");
  });

  it("sends no-store on the redirect that carries the session cookie", async () => {
    nextIdentity = identityOf();

    const started = await raw("/api/v1/auth/oauth/google/start");
    const state = new URL(started.location as string).searchParams.get("state") ?? "";

    const response = await fetch(
      `${client.url}/api/v1/auth/oauth/google/callback?code=c&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `oauth_tx=${cookieValue(started.cookies, "oauth_tx")}` }, redirect: "manual" },
    );

    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("the link challenge (R4)", () => {
  // Case 4, and the reason the whole feature exists in this shape.
  async function collide() {
    await signInWith("google", identityOf());

    const challenge = await signInWith(
      "github",
      identityOf({ provider: "github", providerAccountId: "gh-1" }),
    );

    const token = new URL(challenge.location as string).searchParams.get("link") ?? "";

    return { challenge, token };
  }

  it("challenges instead of signing in or creating a second account", async () => {
    const { challenge, token } = await collide();

    expect(challenge.status).toBe(302);
    expect(challenge.location).toContain("/login?link=");
    expect(token).not.toBe("");

    // The three things that must NOT have happened.
    expect(await userCount()).toBe(1);
    expect(await prisma.oauth_accounts.count()).toBe(1);
    expect(cookieValue(challenge.cookies, "refresh")).toBeNull();

    expect(await prisma.oauth_link_tokens.count()).toBe(1);
  });

  it("stores only the hash of the challenge token", async () => {
    const { token } = await collide();

    const row = await prisma.oauth_link_tokens.findFirstOrThrow();

    expect(row.token_hash).toBe(sha256(token));
    expect(row.token_hash).not.toBe(token);
  });

  it("links the identity once the right person confirms", async () => {
    const { token } = await collide();

    const signedIn = await signInWith("google", identityOf());
    const accessToken = await accessTokenFrom(signedIn);

    const confirmed = await raw("/api/v1/auth/oauth/link/confirm", {
      method: "POST",
      token: accessToken,
      body: { token },
    });

    expect(confirmed.status).toBe(204);
    expect(await prisma.oauth_accounts.count()).toBe(2);
    expect(await userCount()).toBe(1);

    // And now GitHub reaches the same account by R1.
    const viaGithub = await signInWith(
      "github",
      identityOf({ provider: "github", providerAccountId: "gh-1" }),
    );

    expect(viaGithub.location).toBe("http://frontend.test/");
    expect(await userCount()).toBe(1);
  });

  // THE forced-linking check. Without it this endpoint becomes "attach the
  // attacker's identity to whoever clicks", which is account takeover.
  it("refuses a confirmation from anyone but the named account", async () => {
    const { token } = await collide();

    const stranger = await makeUser("stranger");

    const confirmed = await raw("/api/v1/auth/oauth/link/confirm", {
      method: "POST",
      token: stranger.token,
      body: { token },
    });

    expect(confirmed.status).toBe(403);
    expect(await prisma.oauth_accounts.count()).toBe(1);
    expect(await prisma.oauth_link_tokens.count({ where: { used_at: null } })).toBe(1);
  });

  it("refuses an unauthenticated confirmation", async () => {
    const { token } = await collide();

    const confirmed = await raw("/api/v1/auth/oauth/link/confirm", {
      method: "POST",
      body: { token },
    });

    expect(confirmed.status).toBe(401);
    expect(await prisma.oauth_accounts.count()).toBe(1);
  });

  it("spends the challenge exactly once", async () => {
    const { token } = await collide();

    const accessToken = await accessTokenFrom(await signInWith("google", identityOf()));

    const first = await raw("/api/v1/auth/oauth/link/confirm", {
      method: "POST",
      token: accessToken,
      body: { token },
    });
    const second = await raw("/api/v1/auth/oauth/link/confirm", {
      method: "POST",
      token: accessToken,
      body: { token },
    });

    expect(first.status).toBe(204);
    expect(second.status).toBe(400);
    expect(await prisma.oauth_accounts.count()).toBe(2);
  });

  // R6 through the challenge path: confirming for an identity the caller has
  // meanwhile linked another way must be a quiet success, not "connected to a
  // different user" — which is the one thing it is not.
  it("is a no-op when the caller already owns the identity", async () => {
    const { token } = await collide();

    const accessToken = await accessTokenFrom(await signInWith("google", identityOf()));

    await prisma.oauth_accounts.create({
      data: {
        user_id: (await prisma.users.findFirstOrThrow()).id,
        provider: "github",
        provider_account_id: "gh-1",
        provider_email: "ada@example.test",
        provider_email_verified: true,
      },
    });

    const confirmed = await raw("/api/v1/auth/oauth/link/confirm", {
      method: "POST",
      token: accessToken,
      body: { token },
    });

    expect(confirmed.status).toBe(204);
    expect(await prisma.oauth_accounts.count()).toBe(2);
  });

  it("refuses an expired challenge", async () => {
    const { token } = await collide();

    await prisma.oauth_link_tokens.updateMany({ data: { expires_at: new Date(Date.now() - 1000) } });

    const accessToken = await accessTokenFrom(await signInWith("google", identityOf()));

    const confirmed = await raw("/api/v1/auth/oauth/link/confirm", {
      method: "POST",
      token: accessToken,
      body: { token },
    });

    expect(confirmed.status).toBe(400);
    expect(await prisma.oauth_accounts.count()).toBe(1);
  });

  it("retires an earlier challenge when a new one is issued", async () => {
    const { token: first } = await collide();

    await signInWith("github", identityOf({ provider: "github", providerAccountId: "gh-1" }));

    const accessToken = await accessTokenFrom(await signInWith("google", identityOf()));

    const confirmed = await raw("/api/v1/auth/oauth/link/confirm", {
      method: "POST",
      token: accessToken,
      body: { token: first },
    });

    expect(confirmed.status).toBe(400);
  });
});

describe("linking from settings", () => {
  it("lists connections and reports whether a password exists", async () => {
    const signedIn = await signInWith("google", identityOf());
    const token = await accessTokenFrom(signedIn);

    const listed = await raw("/api/v1/auth/oauth/connections", { token });

    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ hasPassword: false });
    expect((listed.body as { connections: unknown[] }).connections).toHaveLength(1);
  });

  it("seals the link target from the access token, not the request", async () => {
    const user = await makeUser("linker");

    const started = await raw("/api/v1/auth/oauth/link/start", {
      method: "POST",
      token: user.token,
      body: { provider: "github" },
    });

    expect(started.status).toBe(200);
    expect((started.body as { authorizeUrl: string }).authorizeUrl).toContain("provider.test");

    nextIdentity = identityOf({ provider: "github", providerAccountId: "gh-42", email: "anything@example.test" });

    const state = new URL((started.body as { authorizeUrl: string }).authorizeUrl).searchParams.get("state") ?? "";

    const done = await raw(
      `/api/v1/auth/oauth/github/callback?code=c&state=${encodeURIComponent(state)}`,
      { cookie: `oauth_tx=${cookieValue(started.cookies, "oauth_tx")}` },
    );

    expect(done.location).toBe("http://frontend.test/profile?linked=1");

    const linked = await prisma.oauth_accounts.findFirstOrThrow();

    expect(linked.user_id).toBe(user.id);
    // The provider's address played no part: it belongs to nobody here.
    expect(await userCount()).toBe(1);
  });

  it("refuses to start a link without a session", async () => {
    const started = await raw("/api/v1/auth/oauth/link/start", {
      method: "POST",
      body: { provider: "github" },
    });

    expect(started.status).toBe(401);
  });

  // A link failure must not land on /login: the person is already signed in,
  // and PublicRoute bounces an authenticated visitor off that page before the
  // message can be read.
  it("reports a link failure on the page the person came from", async () => {
    await signInWith("google", identityOf());

    const other = await makeUser("other");

    const started = await raw("/api/v1/auth/oauth/link/start", {
      method: "POST",
      token: other.token,
      body: { provider: "google" },
    });

    nextIdentity = identityOf();

    const state =
      new URL((started.body as { authorizeUrl: string }).authorizeUrl).searchParams.get("state") ??
      "";

    const done = await raw(
      `/api/v1/auth/oauth/google/callback?code=c&state=${encodeURIComponent(state)}`,
      { cookie: `oauth_tx=${cookieValue(started.cookies, "oauth_tx")}` },
    );

    expect(done.location).toBe("http://frontend.test/profile?error=already_linked");
    expect(done.location).not.toContain("/login");
  });

  it("reports a failed link on the profile page too", async () => {
    const user = await makeUser("canceller");

    const started = await raw("/api/v1/auth/oauth/link/start", {
      method: "POST",
      token: user.token,
      body: { provider: "github" },
    });

    const state =
      new URL((started.body as { authorizeUrl: string }).authorizeUrl).searchParams.get("state") ??
      "";

    nextIdentity = new Error("provider exploded");

    const done = await raw(
      `/api/v1/auth/oauth/github/callback?code=c&state=${encodeURIComponent(state)}`,
      { cookie: `oauth_tx=${cookieValue(started.cookies, "oauth_tx")}` },
    );

    expect(done.location?.startsWith("http://frontend.test/profile?error=")).toBe(true);
  });

  // The cancel branch returns before the code is even looked at, so the mode
  // has to be resolved from the transaction FIRST or a cancelled link lands on
  // /login, which PublicRoute discards for a signed-in visitor.
  it("reports a CANCELLED link on the profile page, not the login page", async () => {
    const user = await makeUser("canceller2");

    const started = await raw("/api/v1/auth/oauth/link/start", {
      method: "POST",
      token: user.token,
      body: { provider: "github" },
    });

    const state =
      new URL((started.body as { authorizeUrl: string }).authorizeUrl).searchParams.get("state") ??
      "";

    const done = await raw(
      `/api/v1/auth/oauth/github/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      { cookie: `oauth_tx=${cookieValue(started.cookies, "oauth_tx")}` },
    );

    expect(done.location).toBe("http://frontend.test/profile?error=provider_denied");
  });

  // A cancelled SIGN-IN still belongs on /login: there is no session to show
  // it to anywhere else.
  it("still reports a cancelled sign-in on the login page", async () => {
    const cancelled = await raw("/api/v1/auth/oauth/google/callback?error=access_denied");

    expect(cancelled.location).toBe("http://frontend.test/login?error=provider_denied");
  });

  // R5, Case 8
  it("never moves an identity that belongs to another account", async () => {
    await signInWith("google", identityOf());

    const other = await makeUser("other");

    const started = await raw("/api/v1/auth/oauth/link/start", {
      method: "POST",
      token: other.token,
      body: { provider: "google" },
    });

    nextIdentity = identityOf();

    const state = new URL((started.body as { authorizeUrl: string }).authorizeUrl).searchParams.get("state") ?? "";

    const done = await raw(
      `/api/v1/auth/oauth/google/callback?code=c&state=${encodeURIComponent(state)}`,
      { cookie: `oauth_tx=${cookieValue(started.cookies, "oauth_tx")}` },
    );

    expect(done.location).toBe("http://frontend.test/profile?error=already_linked");

    const identity = await prisma.oauth_accounts.findFirstOrThrow();

    expect(identity.user_id).not.toBe(other.id);
    expect(await prisma.oauth_accounts.count()).toBe(1);
  });
});

describe("unlinking", () => {
  it("refuses to remove the only way into an account", async () => {
    const signedIn = await signInWith("google", identityOf());
    const token = await accessTokenFrom(signedIn);

    const listed = await raw("/api/v1/auth/oauth/connections", { token });
    const [connection] = (listed.body as { connections: { id: string }[] }).connections;

    const removed = await raw(`/api/v1/auth/oauth/connections/${connection.id}`, {
      method: "DELETE",
      token,
    });

    expect(removed.status).toBe(409);
    expect(await prisma.oauth_accounts.count()).toBe(1);
  });

  it("allows it once a password exists", async () => {
    const signedIn = await signInWith("google", identityOf());
    const token = await accessTokenFrom(signedIn);

    await prisma.users.updateMany({ data: { password_hash: "argon2-placeholder" } });

    const listed = await raw("/api/v1/auth/oauth/connections", { token });
    const [connection] = (listed.body as { connections: { id: string }[] }).connections;

    const removed = await raw(`/api/v1/auth/oauth/connections/${connection.id}`, {
      method: "DELETE",
      token,
    });

    expect(removed.status).toBe(204);
    expect(await prisma.oauth_accounts.count()).toBe(0);
  });

  // Two concurrent HTTP unlinks do NOT prove this: over a pool they usually
  // serialise anyway, so such a test passes whether or not the lock is there
  // (rowLocks.int.test.ts records that this was verified). Assert the lock
  // directly instead — without it READ COMMITTED lets two unlinks of the last
  // two methods both read "two remain" and both succeed.
  it("takes a row lock that blocks a second unlink of the same account", async () => {
    const user = await makeUser("locked");

    let releaseHolder: (() => void) | undefined;
    const holderMayFinish = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });

    let acquired = false;

    const holder = prisma.$transaction(async (tx) => {
      await oauthRepo.lockUser(tx, user.id);
      acquired = true;
      await holderMayFinish;
    });

    try {
      while (!acquired) await new Promise((resolve) => setImmediate(resolve));

      const contender = prisma.$transaction(async (tx) => {
        await tx.$executeRaw`set local lock_timeout = '400ms'`;
        await oauthRepo.lockUser(tx, user.id);

        return "acquired without waiting";
      });

      await expect(contender).rejects.toThrow();
    } finally {
      releaseHolder!();
      await holder;
    }
  });

  it("cannot remove somebody else's connection", async () => {
    const signedIn = await signInWith("google", identityOf());
    const connection = await prisma.oauth_accounts.findFirstOrThrow();

    const stranger = await makeUser("stranger");

    const removed = await raw(`/api/v1/auth/oauth/connections/${connection.id}`, {
      method: "DELETE",
      token: stranger.token,
    });

    expect(removed.status).toBe(404);
    expect(await prisma.oauth_accounts.count()).toBe(1);
    expect(signedIn.status).toBe(302);
  });
});

describe("password login alongside OAuth", () => {
  // The constant-time property: an OAuth-only account must fail exactly the way
  // a non-existent one does, with the same message.
  it("refuses a password login for an account that has none", async () => {
    await signInWith("google", identityOf());

    const attempted = await raw("/api/v1/auth/login", {
      method: "POST",
      body: { identifier: "ada@example.test", password: "anything-at-all" },
    });

    const unknown = await raw("/api/v1/auth/login", {
      method: "POST",
      body: { identifier: "nobody@example.test", password: "anything-at-all" },
    });

    expect(attempted.status).toBe(401);
    expect(attempted.body).toEqual(unknown.body);
  });
});
