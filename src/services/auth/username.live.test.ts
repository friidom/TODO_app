// hits the real project — the unique index and CHECK constraints can't be tested against a mock.
// excluded from npm test, run with npm run test:live.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SERVICE_ROLE_KEY = import.meta.env
  .VEYLO_SERVICE_ROLE_KEY as unknown as string;

const TEST_EMAIL_DOMAIN = "@veylo-live-test.dev";
const STAMP = Date.now().toString(36);
const PASSWORD = `Veylo-username-${STAMP}!aA1`;

const WANTED = `ada_${STAMP}`.slice(0, 24);

let admin: SupabaseClient;
const createdUsers: string[] = [];

function anonClient(tag: string) {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `veylo-username-${tag}-${STAMP}`,
    },
  });
}

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

    // a race takes the next free name instead of leaving the account with no board
    expect(rpcError).toBeNull();

    const settled = await usernameOf(userId);

    expect(settled).not.toBe(WANTED);
    expect(settled).toMatch(new RegExp(`^${WANTED}\\d+$`));
  }, 120_000);

  it("TREATS A DIFFERENT CASE AS THE SAME NAME", async () => {
    const shouted = WANTED.toUpperCase();

    const { data } = await anonClient("probe3").rpc("username_available", {
      p_username: shouted,
    });

    expect(data).toBe(false);

    const { userId, rpcError } = await register("three", shouted);

    expect(rpcError).toBeNull();

    const settled = await usernameOf(userId);

    expect(settled).toBe(settled!.toLowerCase());
    expect(settled).not.toBe(WANTED);
  }, 120_000);

  it("REJECTS A COLLIDING WRITE AT THE DATABASE, NOT ONLY IN THE UI", async () => {
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

    // index is on lower(username)
    expect(casedError?.code).toBeDefined();
  }, 120_000);

  it("rejects a badly shaped username at the database", async () => {
    const { userId } = await register("five", `mae_${STAMP}`.slice(0, 24));

    for (const bad of ["ab", "_ada", "ada lovelace", "ada.lovelace"]) {
      const { error } = await admin
        .from("profiles")
        .update({ username: bad })
        .eq("id", userId);

      // profiles_username_shape CHECK violation
      expect(error?.code).toBe("23514");
    }
  }, 120_000);

  it("will not let a username be removed once set", async () => {
    const { userId } = await register("six", `rae_${STAMP}`.slice(0, 24));

    const { error } = await admin
      .from("profiles")
      .update({ username: null })
      .eq("id", userId);

    // NOT NULL violation
    expect(error?.code).toBe("23502");
  }, 120_000);
});
