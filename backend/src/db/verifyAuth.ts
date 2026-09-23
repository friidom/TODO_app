// B5-13 — the auth flows that need a real database, driven over real HTTP
// (not a mocked service call) against an app booted on an ephemeral port.
// `npm test` stays database-free; this covers what only the schema and its
// triggers can prove. Every account is prefixed, and the prefix is deleted
// before and after the run — cascading through profile, space, board,
// columns, membership and activity rows.
//
// Run with: npm run auth:verify

import type { Server } from "node:http";

import { app } from "../app.js";
import { sha256 } from "../lib/tokens.js";
import { closePool, describeError } from "./client.js";
import { prisma } from "./prisma.js";

const PREFIX = "b5-probe-";
const DOMAIN = "@probe.invalid";
const PASSWORD = "probe-password-9273";

// Distinctive so the log scan below cannot match it by accident.
const FORGED_CODE = "probe-authcode-a1b2c3d4e5";

let failures = 0;

function check(label: string, pass: boolean, detail?: unknown): void {
  if (pass) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  (${JSON.stringify(detail)})` : ""}`);
  }
}

// So a later check can assert no credential reached a log line.
const transcript: string[] = [];

function captureConsole(): () => void {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const record =
    (write: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      transcript.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      write(...args);
    };

  console.log = record(original.log);
  console.warn = record(original.warn);
  console.error = record(original.error);

  // morgan writes through process.stdout, never console.*, so without this the
  // access log -- the one place a live authorization code is guaranteed to be
  // printed -- is invisible to every check below.
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (typeof chunk === "string") transcript.push(chunk);

    return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stdout.write;

  return () => {
    Object.assign(console, original);
    process.stdout.write = originalWrite;
  };
}

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
  cookies: string[];
  headers: Headers;
}

let baseUrl = "";

// Shared across the whole run, like a browser's cookie jar. `cookie: null`
// opts a call out to present a different token.
let jar: string | undefined;

async function api(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; cookie?: string | null } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { accept: "application/json" };

  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;

  const cookie = options.cookie === undefined ? jar : options.cookie;

  if (cookie !== null && cookie !== undefined) headers.cookie = `refresh=${cookie}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const cookies = response.headers.getSetCookie();
  const refresh = cookies.find((value) => value.startsWith("refresh="));

  if (refresh !== undefined) {
    const value = refresh.slice("refresh=".length, refresh.indexOf(";"));

    jar = value === "" ? undefined : value;
  }

  const text = await response.text();

  return {
    status: response.status,
    body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
    cookies,
    headers: response.headers,
  };
}

function emailFor(name: string): string {
  return `${PREFIX}${name}${DOMAIN}`;
}

function usernameFor(name: string): string {
  return `${PREFIX.replace(/-/g, "_")}${name}`.slice(0, 30);
}

function register(name: string, password = PASSWORD) {
  return api("POST", "/api/v1/auth/register", {
    body: { email: emailFor(name), password, username: usernameFor(name) },
    cookie: null,
  });
}

async function cleanUp(): Promise<number> {
  const { count } = await prisma.users.deleteMany({
    where: { email: { startsWith: PREFIX } },
  });

  return count;
}

async function part1_registerLoginMeRefreshLogout() {
  console.log("\n--- Part 1: register -> login -> /me -> refresh -> logout ---");

  const created = await register("alice");

  check("register returns 201", created.status === 201, created.status);

  const user = created.body.user as { id: string; email: string; profile: { username: string } };

  check("register returns the account", typeof user?.id === "string", created.body);
  check(
    "register returns the profile it provisioned",
    user?.profile?.username === usernameFor("alice"),
    user?.profile,
  );
  check("register sets a refresh cookie", jar !== undefined);
  check(
    "register returns an access token in the body, not a cookie",
    typeof created.body.accessToken === "string",
  );

  const login = await api("POST", "/api/v1/auth/login", {
    body: { identifier: emailFor("alice"), password: PASSWORD },
    cookie: null,
  });

  check("login by email returns 200", login.status === 200, login.body);

  const byUsername = await api("POST", "/api/v1/auth/login", {
    body: { identifier: usernameFor("alice").toUpperCase(), password: PASSWORD },
    cookie: null,
  });

  check("login by username, case-insensitively", byUsername.status === 200, byUsername.body);

  const byMixedCaseEmail = await api("POST", "/api/v1/auth/login", {
    body: { identifier: emailFor("alice").toUpperCase(), password: PASSWORD },
    cookie: null,
  });

  check(
    "login by email is case-insensitive (users.email is citext)",
    byMixedCaseEmail.status === 200,
    byMixedCaseEmail.body,
  );

  const accessToken = byMixedCaseEmail.body.accessToken as string;

  const me = await api("GET", "/api/v1/auth/me", { token: accessToken });

  check("/me returns the signed-in account", me.status === 200 && me.body.user !== undefined, me.body);
  check(
    "/me identifies the same user",
    (me.body.user as { id: string }).id === user.id,
    me.body.user,
  );

  const anonymous = await api("GET", "/api/v1/auth/me", { token: undefined, cookie: null });

  check("/me without a token is 401, not 500", anonymous.status === 401, anonymous.status);

  const rubbish = await api("GET", "/api/v1/auth/me", { token: "not-a-jwt" });

  check("/me with a malformed token is 401", rubbish.status === 401, rubbish.status);

  const before = jar;
  const refreshed = await api("POST", "/api/v1/auth/refresh");

  check("refresh returns a new access token", refreshed.status === 200, refreshed.body);
  check("refresh rotates the cookie", jar !== before && jar !== undefined);
  check(
    "refresh works with no Authorization header — an expired access token is when it is called",
    refreshed.body.accessToken !== undefined,
  );

  const loggedOut = await api("POST", "/api/v1/auth/logout");

  check("logout returns 204", loggedOut.status === 204, loggedOut.status);
  check(
    "logout clears the cookie",
    loggedOut.cookies.some((c) => c.startsWith("refresh=;")),
    loggedOut.cookies,
  );

  const afterLogout = await api("POST", "/api/v1/auth/refresh", { cookie: before });

  check("the pre-logout token cannot be refreshed", afterLogout.status === 401, afterLogout.status);

  return user.id;
}

async function part2_provisioning(userId: string) {
  console.log("\n--- Part 2: a new account gets exactly one board with four columns ---");

  const boards = await prisma.boards.findMany({
    where: { owner_id: userId },
    select: { id: true, title: true, space_id: true },
  });

  check("exactly one board", boards.length === 1, boards.length);

  const board = boards[0]!;

  check("named My Board", board.title === "My Board", board.title);
  check("filed into a space", board.space_id !== null);

  const space = await prisma.spaces.findUnique({ where: { id: board.space_id! } });

  check("the space is My Space, owned by the new user", space?.title === "My Space" && space.owner_id === userId, space);

  const columns = await prisma.columns.findMany({
    where: { board_id: board.id },
    orderBy: { position: "asc" },
    select: { title: true, category: true, position: true, rank: true },
  });

  check("four columns", columns.length === 4, columns.length);
  check(
    "in provision_user's order, with its categories",
    JSON.stringify(columns.map((c) => [c.title, c.category])) ===
      JSON.stringify([
        ["To Do", "todo"],
        ["In Progress", "in_progress"],
        ["In Review", "in_review"],
        ["Done", "done"],
      ]),
    columns,
  );
  check(
    "ranked, so nothing depends on byRank's position fallback",
    columns.every((c, index) => c.rank === index * 1024),
    columns.map((c) => c.rank),
  );

  const membership = await prisma.board_members.findMany({ where: { board_id: board.id } });

  check(
    "the owner membership exists and is 'owner'",
    membership.length === 1 && membership[0]!.user_id === userId && membership[0]!.role === "owner",
    membership,
  );

  const activity = await prisma.activities.findMany({ where: { board_id: board.id } });
  const kinds = activity.map((a) => `${a.entity_type}/${a.action}`).sort();

  check(
    "provisioning logs the membership and the four columns",
    JSON.stringify(kinds) ===
      JSON.stringify([
        "column/created",
        "column/created",
        "column/created",
        "column/created",
        "member/added",
      ]),
    kinds,
  );
  check(
    "every entry is stamped with the new user as actor",
    activity.length > 0 && activity.every((a) => a.actor_id === userId),
    activity.map((a) => ({ action: a.action, actor_id: a.actor_id })),
  );
}

async function part3_duplicateAndIdempotence() {
  console.log("\n--- Part 3: a second registration, and idempotent provisioning ---");

  const again = await register("alice");

  check("registering the same email twice is 409, not 500", again.status === 409, again.status);
  check(
    "and says which value collided",
    /email/i.test(String((again.body.error as { message?: string })?.message)),
    again.body,
  );

  const boards = await prisma.boards.count({
    where: { profiles: { users: { email: emailFor("alice") } } },
  });

  check("the failed attempt provisioned nothing", boards === 1, boards);

  const second = await api("POST", "/api/v1/auth/register", {
    body: {
      email: emailFor("bob"),
      password: PASSWORD,
      username: usernameFor("alice"),
    },
    cookie: null,
  });

  const username = (second.body.user as { profile: { username: string } })?.profile?.username;

  check("a taken username resolves to a free one", second.status === 201, second.status);
  check(
    "by appending a suffix rather than failing",
    username === `${usernameFor("alice")}2`.slice(0, 30) || username?.startsWith(usernameFor("alice")),
    username,
  );

  const { provisionUser } = await import("../modules/users/users.service.js");
  const user = await prisma.users.findUnique({ where: { email: emailFor("alice") } });

  const first = await prisma.$transaction((tx) =>
    provisionUser(tx, { id: user!.id, email: user!.email, username: usernameFor("alice") }),
  );
  const repeat = await prisma.$transaction((tx) =>
    provisionUser(tx, { id: user!.id, email: user!.email, username: usernameFor("alice") }),
  );

  check("provisioning twice returns the same board", first === repeat, { first, repeat });

  const total = await prisma.boards.count({ where: { owner_id: user!.id } });

  check("and still exactly one board exists", total === 1, total);
}

async function part4_identicalFailures() {
  console.log("\n--- Part 4: wrong password and unknown user are indistinguishable ---");

  const attempt = (identifier: string, password: string) =>
    api("POST", "/api/v1/auth/login", { body: { identifier, password }, cookie: null });

  // Warm-up: the first argon2 call pays a lazy-init cost that would skew the
  // timing comparison below.
  await attempt(emailFor("nobody"), PASSWORD);

  const wrongPassword = await attempt(emailFor("alice"), "not-the-password");
  const unknownUser = await attempt(emailFor("nobody"), "not-the-password");
  const unknownUsername = await attempt("nosuchusername", "not-the-password");

  check("wrong password is 401", wrongPassword.status === 401, wrongPassword.status);
  check(
    "unknown email gives the identical status and body",
    unknownUser.status === wrongPassword.status &&
      JSON.stringify(unknownUser.body) === JSON.stringify(wrongPassword.body),
    { wrongPassword: wrongPassword.body, unknownUser: unknownUser.body },
  );
  check(
    "unknown username gives the identical status and body",
    unknownUsername.status === wrongPassword.status &&
      JSON.stringify(unknownUsername.body) === JSON.stringify(wrongPassword.body),
    unknownUsername.body,
  );
  check(
    "neither response leaks which check failed",
    !/user|email|username|exist/i.test(
      String((wrongPassword.body.error as { message?: string })?.message),
    ),
    wrongPassword.body,
  );

  const median = async (identifier: string) => {
    const samples: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      const started = performance.now();

      await attempt(identifier, "not-the-password");
      samples.push(performance.now() - started);
    }

    return samples.sort((a, b) => a - b)[2]!;
  };

  const knownMs = await median(emailFor("alice"));
  const unknownMs = await median(emailFor("nobody"));
  const ratio = Math.max(knownMs, unknownMs) / Math.min(knownMs, unknownMs);

  check(
    `the two take comparable time (${knownMs.toFixed(0)}ms vs ${unknownMs.toFixed(0)}ms)`,
    ratio < 2,
    { knownMs, unknownMs, ratio },
  );
}

async function part5_refreshRotation() {
  console.log("\n--- Part 5: rotation, and reuse revoking the family ---");

  const created = await register("carol");
  const original = jar!;

  const rotated = await api("POST", "/api/v1/auth/refresh", { cookie: original });
  const second = jar!;

  check("the first refresh succeeds", rotated.status === 200, rotated.status);
  check("and issues a different token", second !== original);

  const replayed = await api("POST", "/api/v1/auth/refresh", { cookie: original });

  check("replaying the rotated token is rejected", replayed.status === 401, replayed.status);

  const stillLive = await api("POST", "/api/v1/auth/refresh", { cookie: second });

  check(
    "and revokes the descendant the legitimate client was holding",
    stillLive.status === 401,
    stillLive.status,
  );

  const userId = (created.body.user as { id: string }).id;
  const sessions = await prisma.sessions.findMany({ where: { user_id: userId } });

  check("every session in the family is revoked", sessions.every((s) => s.revoked_at !== null), {
    sessions: sessions.length,
    live: sessions.filter((s) => s.revoked_at === null).length,
  });
  check(
    "they share one family_id — rotation extends a lineage, it does not start one",
    new Set(sessions.map((s) => s.family_id)).size === 1,
    sessions.map((s) => s.family_id),
  );

  const stored = await prisma.sessions.findFirst({ where: { user_id: userId } });

  check(
    "what is stored is a hash, not the token",
    stored !== null && stored.token_hash !== original && /^[0-9a-f]{64}$/.test(stored.token_hash),
  );
}

async function part6_passwordReset() {
  console.log("\n--- Part 6: password reset ---");

  const created = await register("dave");
  const userId = (created.body.user as { id: string }).id;
  const sessionCookie = jar!;

  const unknown = await api("POST", "/api/v1/auth/password/forgot", {
    body: { email: emailFor("nobody") },
    cookie: null,
  });
  const known = await api("POST", "/api/v1/auth/password/forgot", {
    body: { email: emailFor("dave") },
    cookie: null,
  });

  check(
    "forgot answers 200 identically for a known and an unknown address",
    unknown.status === 200 &&
      known.status === 200 &&
      JSON.stringify(unknown.body) === JSON.stringify(known.body),
    { unknown: unknown.body, known: known.body },
  );

  // The console mail driver prints the reset link to the log.
  const link = transcript.join("\n").match(/reset-password\?token=([^\s]+)/);
  const token = link === null ? undefined : decodeURIComponent(link[1]!);

  check("the reset link reached the mail driver", token !== undefined);

  const stored = await prisma.password_reset_tokens.findMany({ where: { user_id: userId } });

  check("one reset token was stored", stored.length === 1, stored.length);
  check(
    "as a hash, not the token itself",
    stored[0] !== undefined && stored[0].token_hash !== token,
  );

  const badToken = await api("POST", "/api/v1/auth/password/reset", {
    body: { token: "not-a-real-token", password: "a-brand-new-password" },
    cookie: null,
  });

  check("an unknown token is refused", badToken.status === 400, badToken.status);

  const reset = await api("POST", "/api/v1/auth/password/reset", {
    body: { token, password: "a-brand-new-password" },
    cookie: null,
  });

  check("the real token is accepted", reset.status === 200, reset.body);

  const replay = await api("POST", "/api/v1/auth/password/reset", {
    body: { token, password: "another-new-password" },
    cookie: null,
  });

  check("and cannot be used twice", replay.status === 400, replay.status);

  const oldPassword = await api("POST", "/api/v1/auth/login", {
    body: { identifier: emailFor("dave"), password: PASSWORD },
    cookie: null,
  });
  const newPassword = await api("POST", "/api/v1/auth/login", {
    body: { identifier: emailFor("dave"), password: "a-brand-new-password" },
    cookie: null,
  });

  check("the old password no longer works", oldPassword.status === 401, oldPassword.status);
  check("the new one does", newPassword.status === 200, newPassword.status);

  const oldSession = await api("POST", "/api/v1/auth/refresh", { cookie: sessionCookie });

  check(
    "the session held before the reset is revoked",
    oldSession.status === 401,
    oldSession.status,
  );
}

async function part7_secrets() {
  console.log("\n--- Part 7: cookie flags, and what never leaves the process ---");

  const created = await register("erin");
  const cookie = created.cookies.find((c) => c.startsWith("refresh=")) ?? "";

  check("the refresh cookie is HttpOnly", /HttpOnly/i.test(cookie), cookie);
  check("scoped to the auth routes", /Path=\/api\/v1\/auth/i.test(cookie), cookie);
  check("and carries a SameSite policy", /SameSite=/i.test(cookie), cookie);

  const serialised = JSON.stringify(created.body);

  check("no password hash in the response", !serialised.includes("password_hash"), serialised.slice(0, 200));
  check("no argon2 hash in the response", !serialised.includes("$argon2"), serialised.slice(0, 200));
  check("no refresh token in the response body", !serialised.includes(jar!));

  const me = await api("GET", "/api/v1/auth/me", { token: created.body.accessToken as string });

  check(
    "nor in /me",
    !JSON.stringify(me.body).includes("password"),
    JSON.stringify(me.body).slice(0, 200),
  );

  check(
    "responses carry X-Content-Type-Options: nosniff",
    created.headers.get("x-content-type-options") === "nosniff",
    created.headers.get("x-content-type-options"),
  );
  check(
    "and do not advertise the framework",
    created.headers.get("x-powered-by") === null,
    created.headers.get("x-powered-by"),
  );

  const logged = transcript.join("\n");

  check("no password appears in any log line", !logged.includes(PASSWORD));
  check("no password hash appears in any log line", !logged.includes("$argon2"));
  check("no refresh token appears in any log line", !logged.includes(jar!));

  const available = await api("GET", `/api/v1/auth/username-available?username=${usernameFor("erin")}`, {
    cookie: null,
  });
  const free = await api("GET", "/api/v1/auth/username-available?username=nobodyhasthisname", {
    cookie: null,
  });
  const malformed = await api("GET", "/api/v1/auth/username-available?username=_bad", {
    cookie: null,
  });

  check("username-available reports a taken name", available.body.available === false, available.body);
  check("and a free one", free.body.available === true, free.body);
  check(
    "a malformed name is unavailable rather than an error",
    malformed.status === 200 && malformed.body.available === false,
    malformed.body,
  );
}

async function part8_logoutEverywhere() {
  console.log("\n--- Part 8: log out everywhere, and what a dead token may not do ---");

  const created = await register("frank");
  const userId = (created.body.user as { id: string }).id;
  const deviceA = jar!;

  const deviceBLogin = await api("POST", "/api/v1/auth/login", {
    body: { identifier: emailFor("frank"), password: PASSWORD },
    cookie: null,
  });
  const deviceB = jar!;

  check("a second sign-in opens a second session", deviceBLogin.status === 200, deviceBLogin.status);

  const families = await prisma.sessions.findMany({
    where: { user_id: userId },
    select: { family_id: true },
  });

  check(
    "the two devices are separate families",
    new Set(families.map((f) => f.family_id)).size === 2,
    families.length,
  );

  // Rotating device A leaves its first token revoked, which is the shape a
  // stolen-but-stale token has.
  const rotated = await api("POST", "/api/v1/auth/refresh", { cookie: deviceA });
  const deviceA2 = jar!;

  check("device A rotates", rotated.status === 200, rotated.status);

  const staleAttempt = await api("POST", "/api/v1/auth/logout?all=true", { cookie: deviceA });

  check(
    "logout-all with a revoked token still answers 204",
    staleAttempt.status === 204,
    staleAttempt.status,
  );

  const unrelated = await api("POST", "/api/v1/auth/refresh", { cookie: deviceB });
  const deviceB2 = jar!;

  check(
    "...but a revoked token cannot log another device out",
    unrelated.status === 200,
    unrelated.status,
  );

  const loggedOut = await api("POST", "/api/v1/auth/logout?all=true", { cookie: deviceA2 });

  check("logout-all with a live token returns 204", loggedOut.status === 204, loggedOut.status);

  const aAfter = await api("POST", "/api/v1/auth/refresh", { cookie: deviceA2 });
  const bAfter = await api("POST", "/api/v1/auth/refresh", { cookie: deviceB2 });

  check("the calling device is signed out", aAfter.status === 401, aAfter.status);
  check("and so is every other device", bAfter.status === 401, bAfter.status);

  const live = await prisma.sessions.count({ where: { user_id: userId, revoked_at: null } });

  check("no live session is left anywhere", live === 0, live);
}

async function part9_expiredRefreshToken() {
  console.log("\n--- Part 9: an expired refresh token ---");

  const login = await api("POST", "/api/v1/auth/login", {
    body: { identifier: emailFor("frank"), password: PASSWORD },
    cookie: null,
  });
  const cookie = jar!;

  check("frank signs in again after being logged out", login.status === 200, login.status);

  // Expiry is a clock, not an event, so the only way into that branch is to
  // move the row's own deadline into the past.
  await prisma.sessions.update({
    where: { token_hash: sha256(cookie) },
    data: { expires_at: new Date(Date.now() - 60_000) },
  });

  const refreshed = await api("POST", "/api/v1/auth/refresh", { cookie });

  check("an expired refresh token is rejected", refreshed.status === 401, refreshed.status);
  check(
    "a rejected refresh still clears the dead cookie",
    refreshed.cookies.some((c) => c.startsWith("refresh=;")),
    refreshed.cookies,
  );

  const row = await prisma.sessions.findUnique({
    where: { token_hash: sha256(cookie) },
    select: { revoked_at: true, family_id: true },
  });

  check("the expired session is revoked, not left live", row?.revoked_at !== null, row);

  const familyLive = await prisma.sessions.count({
    where: { family_id: row!.family_id, revoked_at: null },
  });

  check("and its whole family with it", familyLive === 0, familyLive);

  const stillOut = await api("POST", "/api/v1/auth/logout?all=true", { cookie });

  check("an expired token cannot drive logout-all either", stillOut.status === 204, stillOut.status);
}

async function part10_deactivatedAccount() {
  console.log("\n--- Part 10: a deactivated account ---");

  const created = await register("grace");
  const userId = (created.body.user as { id: string }).id;
  const accessToken = created.body.accessToken as string;
  const cookie = jar!;

  const before = await api("GET", "/api/v1/auth/me", { token: accessToken });

  check("grace can read /me while active", before.status === 200, before.status);

  await prisma.users.update({ where: { id: userId }, data: { deactivated_at: new Date() } });

  const attempt = await api("POST", "/api/v1/auth/login", {
    body: { identifier: emailFor("grace"), password: PASSWORD },
    cookie: null,
  });
  const wrongPassword = await api("POST", "/api/v1/auth/login", {
    body: { identifier: emailFor("grace"), password: "not-the-password" },
    cookie: null,
  });

  check("a deactivated account cannot sign in", attempt.status === 401, attempt.status);
  check(
    "and is indistinguishable from a wrong password",
    attempt.status === wrongPassword.status &&
      JSON.stringify(attempt.body) === JSON.stringify(wrongPassword.body),
    { deactivated: attempt.body, wrongPassword: wrongPassword.body },
  );

  // The access token is still cryptographically valid, so this is the service
  // refusing rather than requireAuth rejecting a signature.
  const me = await api("GET", "/api/v1/auth/me", { token: accessToken });

  check("its unexpired access token stops working on /me", me.status === 401, me.status);

  const refreshed = await api("POST", "/api/v1/auth/refresh", { cookie });

  check("its refresh token is rejected", refreshed.status === 401, refreshed.status);

  const live = await prisma.sessions.count({ where: { user_id: userId, revoked_at: null } });

  check("the refused refresh revoked its family", live === 0, live);
}

// Drives the two redirect-shaped routes directly: api() above always sends the
// refresh cookie and always follows redirects, and neither is right here.
async function oauthFetch(
  path: string,
  cookie?: string,
): Promise<{ status: number; location: string | null; cookies: string[]; cacheControl: string | null }> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie === undefined ? {} : { cookie },
    redirect: "manual",
  });

  await response.text();

  return {
    status: response.status,
    location: response.headers.get("location"),
    cookies: response.headers.getSetCookie(),
    cacheControl: response.headers.get("cache-control"),
  };
}

function oauthCookieFrom(cookies: string[]): string | undefined {
  const found = cookies.find((value) => value.startsWith("oauth_tx="));

  return found === undefined ? undefined : found.slice(0, found.indexOf(";"));
}

async function part11_oauth() {
  console.log("\n--- Part 11: OAuth redirect routes ---");

  const listed = await api("GET", "/api/v1/auth/oauth/providers", { cookie: null });

  check(
    "the provider list is an array the sign-in page can render",
    listed.status === 200 && Array.isArray(listed.body.providers),
    listed.body,
  );

  const configured = (listed.body.providers as string[] | undefined) ?? [];

  if (configured.length === 0) {
    console.log("(no OAuth provider configured -- redirect probes skipped)");

    return;
  }

  const provider = configured[0];

  const started = await oauthFetch(`/api/v1/auth/oauth/${provider}/start`);
  const txCookie = oauthCookieFrom(started.cookies);

  check("start answers a redirect, not JSON", started.status === 302, started.status);
  check(
    "start leaves the app for the provider",
    started.location?.startsWith("https://") === true,
    started.location,
  );
  check("start sets the transaction cookie", txCookie !== undefined);
  check(
    "the transaction cookie is HttpOnly and SameSite=Lax",
    started.cookies.some(
      (c) => c.startsWith("oauth_tx=") && /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c),
    ),
    started.cookies.find((c) => c.startsWith("oauth_tx=")),
  );
  check(
    "and is scoped to the auth path",
    started.cookies.some((c) => c.startsWith("oauth_tx=") && c.includes("Path=/api/v1/auth")),
  );
  check("start is not cacheable", started.cacheControl?.includes("no-store") === true, started.cacheControl);

  // The CSRF check: a code delivered with a state the cookie does not agree
  // with must never be exchanged.
  const forged = await oauthFetch(
    `/api/v1/auth/oauth/${provider}/callback?code=${FORGED_CODE}&state=forged`,
    txCookie,
  );

  check("a forged state is refused", forged.status === 302, forged.status);
  check(
    "and refused as invalid_state, with no session issued",
    forged.location?.includes("error=invalid_state") === true &&
      !forged.cookies.some((c) => c.startsWith("refresh=")),
    forged.location,
  );

  const noCookie = await oauthFetch(
    `/api/v1/auth/oauth/${provider}/callback?code=${FORGED_CODE}&state=x`,
  );

  check(
    "a callback with no transaction cookie is refused",
    noCookie.location?.includes("error=") === true,
    noCookie.location,
  );

  const cancelled = await oauthFetch(`/api/v1/auth/oauth/${provider}/callback?error=access_denied`);

  check(
    "a cancelled consent redirects without echoing the provider's text",
    cancelled.location?.includes("error=provider_denied") === true &&
      cancelled.location.includes("access_denied") === false,
    cancelled.location,
  );

  const unknown = await oauthFetch("/api/v1/auth/oauth/myspace/start");

  check(
    "an unknown provider redirects rather than rendering a JSON error",
    unknown.status === 302 && unknown.location?.includes("/login?error=") === true,
    { status: unknown.status, location: unknown.location },
  );

  const anonymous = await api("POST", "/api/v1/auth/oauth/link/start", {
    body: { provider },
    cookie: null,
  });

  check("linking requires a session", anonymous.status === 401, anonymous.status);

  // THE leak check. That code sat in the query string of every request above,
  // and both morgan and the error handler print request URLs.
  const logged = transcript.join("\n");

  check("no authorization code appears in any log line", !logged.includes(FORGED_CODE));
  check(
    "the access log kept the line but redacted the code",
    logged.includes("code=REDACTED"),
    logged
      .split("\n")
      .filter((line) => line.includes("oauth"))
      .slice(-2),
  );
}

async function part12_rateLimit() {
  console.log("\n--- Part 12: the rate limiter trips (last: it spends the IP budget) ---");

  let limited = 0;
  let status = 0;

  for (let i = 0; i < 60; i += 1) {
    const response = await api("POST", "/api/v1/auth/login", {
      body: { identifier: emailFor(`flood-${i}`), password: "wrong" },
      cookie: null,
    });

    status = response.status;

    if (response.status === 429) {
      limited = i;
      break;
    }
  }

  check("repeated login attempts are eventually refused", status === 429, { attempts: limited });
  check("the limiter trips well before 60 attempts", limited > 0 && limited < 60, limited);
}

async function main() {
  const restoreConsole = captureConsole();
  let server: Server | undefined;

  try {
    const removed = await cleanUp();

    if (removed > 0) console.log(`(cleared ${removed} leftover probe account(s))`);

    server = await new Promise<Server>((resolve, reject) => {
      // Port 0: OS picks a free one.
      const listener = app.listen(0, () => resolve(listener));

      listener.on("error", reject);
    });

    const address = server.address();

    if (address === null || typeof address === "string") throw new Error("no port");

    baseUrl = `http://127.0.0.1:${address.port}`;
    console.log(`(app listening on ${baseUrl})`);

    const userId = await part1_registerLoginMeRefreshLogout();

    await part2_provisioning(userId);
    await part3_duplicateAndIdempotence();
    await part4_identicalFailures();
    await part5_refreshRotation();
    await part6_passwordReset();
    await part7_secrets();
    await part8_logoutEverywhere();
    await part9_expiredRefreshToken();
    await part10_deactivatedAccount();
    await part11_oauth();
    await part12_rateLimit();
  } catch (error) {
    failures += 1;
    console.error(`\nERROR  ${describeError(error)}`);
    console.error(error);
  } finally {
    const removed = await cleanUp().catch(() => -1);

    console.log(`\n(cleaned up ${removed} probe account(s))`);

    server?.close();
    await prisma.$disconnect();
    await closePool();
    restoreConsole();
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
