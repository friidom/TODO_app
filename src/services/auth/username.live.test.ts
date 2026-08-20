/**
 * M10-01 — unique usernames, where the rule actually lives.
 *
 * **The four cases this covers cannot be tested any other way.** `duplicate`,
 * `case-insensitive duplicate`, `registration carries the username` and
 * `provisioning still works` are all statements about a unique index, a CHECK
 * constraint and a `security definer` function. `src/utils/username.test.ts`
 * covers the shape rules; it cannot cover whether Postgres agrees, and the
 * whole point of M10-01 is that Postgres is the authority and the client is
 * advice.
 *
 * Same conventions as the other live suites: matched by `vitest.live.config.ts`,
 * excluded from `npm test`, run with `npm run test:live`. Accounts are minted
 * for the run and deleted in `afterAll`, with a sweep by email domain.
 *
 * **It fails until the three M10-01 migrations are pushed**, which is the
 * correct state for it to be in — the same shape as the M6-14 regression test.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SERVICE_ROLE_KEY = import.meta.env
  .VEYLO_SERVICE_ROLE_KEY as unknown as string;

const TEST_EMAIL_DOMAIN = "@veylo-live-test.dev";
const STAMP = Date.now().toString(36);
const PASSWORD = `Veylo-username-${STAMP}!aA1`;

/** Short enough to leave room for a numeric suffix inside the 30-char cap. */
const WANTED = `ada_${STAMP}`.slice(0, 24);

let admin: SupabaseClient;
const createdUsers: string[] = [];

/** An anonymous client — registration happens signed out, and so must this. */
function anonClient(tag: string) {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `veylo-username-${tag}-${STAMP}`,
    },
  });
}

/**
 * A confirmed account carrying `username` in its metadata, provisioned through
 * the RPC the client calls — the same path a real registration takes, minus the
 * confirmation click.
 */
async function register(tag: string, username: string) {
  const email = `m10.${tag}.${STAMP}${TEST_EMAIL_DOMAIN}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username },
  });

  if (error) throw error;

  createdUsers.push(data.user!.id);

  const client = anonClient(tag);

  await client.auth.signInWithPassword({ email, password: PASSWORD });

  const { data: boardId, error: rpcError } =
    await client.rpc("provision_new_user");

  return { client, userId: data.user!.id, boardId, rpcError };
}

async function usernameOf(userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();

  return data?.username as string | null;
}

describe("M10-01 unique usernames, against the real project", () => {
  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);

    const { data: all } = await admin.auth.admin.listUsers({ perPage: 1000 });

    for (const user of all?.users ?? []) {
      if (!user.email?.endsWith(TEST_EMAIL_DOMAIN)) continue;

      await admin.auth.admin.deleteUser(user.id);
    }
  }, 120_000);

  it("answers the availability check to a signed-out visitor", async () => {
    // Callable by `anon`, because the registration form has no session. The
    // answer is a boolean and nothing else, so it discloses no row.
    const { data, error } = await anonClient("probe").rpc(
      "username_available",
      {
        p_username: WANTED,
      },
    );

    expect(error).toBeNull();
    expect(data).toBe(true);
  }, 60_000);

  it("REGISTRATION CARRIES THE USERNAME THROUGH TO THE PROFILE", async () => {
    const { userId, boardId, rpcError } = await register("one", WANTED);

    // Provisioning still works — the M6-14 guarantee, re-asserted because this
    // milestone rewrites the same function.
    expect(rpcError).toBeNull();
    expect(boardId).toEqual(expect.any(String));

    expect(await usernameOf(userId)).toBe(WANTED);
  }, 120_000);

  it("reports the name as taken once it is held", async () => {
    const { data } = await anonClient("probe2").rpc("username_available", {
      p_username: WANTED,
    });

    expect(data).toBe(false);
  }, 60_000);

  it("REFUSES A DUPLICATE, AND SETTLES IT RATHER THAN FAILING", async () => {
    const { userId, rpcError } = await register("two", WANTED);

    // `provision_user` must never raise — M6-14's lesson — so a genuine race
    // takes the next free name instead of leaving an account with no board.
    expect(rpcError).toBeNull();

    const settled = await usernameOf(userId);

    expect(settled).not.toBe(WANTED);
    expect(settled).toMatch(new RegExp(`^${WANTED}\\d+$`));
  }, 120_000);

  it("TREATS A DIFFERENT CASE AS THE SAME NAME", async () => {
    const shouted = WANTED.toUpperCase();

    // The availability check normalises before asking, so the two spellings are
    // one question.
    const { data } = await anonClient("probe3").rpc("username_available", {
      p_username: shouted,
    });

    expect(data).toBe(false);

    const { userId, rpcError } = await register("three", shouted);

    expect(rpcError).toBeNull();

    const settled = await usernameOf(userId);

    // Stored lowercased, and not equal to the row that already holds it.
    expect(settled).toBe(settled!.toLowerCase());
    expect(settled).not.toBe(WANTED);
  }, 120_000);

  it("REJECTS A COLLIDING WRITE AT THE DATABASE, NOT ONLY IN THE UI", async () => {
    // The guarantee itself: bypass every client rule and every RPC, and write
    // straight to the table with a key that ignores RLS. The unique index is
    // the only thing left standing between this and two identical names.
    const { userId } = await register("four", `zed_${STAMP}`.slice(0, 24));

    const { error } = await admin
      .from("profiles")
      .update({ username: WANTED })
      .eq("id", userId);

    expect(error?.code).toBe("23505");

    const { error: casedError } = await admin
      .from("profiles")
      .update({ username: WANTED.toUpperCase() })
      .eq("id", userId);

    // Case-insensitive, because the index is on lower(username).
    expect(casedError?.code).toBeDefined();
  }, 120_000);

  it("rejects a badly shaped username at the database", async () => {
    const { userId } = await register("five", `mae_${STAMP}`.slice(0, 24));

    for (const bad of ["ab", "_ada", "ada lovelace", "ada.lovelace"]) {
      const { error } = await admin
        .from("profiles")
        .update({ username: bad })
        .eq("id", userId);

      // 23514 is a CHECK violation: profiles_username_shape.
      expect(error?.code).toBe("23514");
    }
  }, 120_000);

  it("will not let a username be removed once set", async () => {
    const { userId } = await register("six", `rae_${STAMP}`.slice(0, 24));

    const { error } = await admin
      .from("profiles")
      .update({ username: null })
      .eq("id", userId);

    // 23502 is a NOT NULL violation.
    expect(error?.code).toBe("23502");
  }, 120_000);
});
