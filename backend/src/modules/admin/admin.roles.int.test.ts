import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { ADMIN_ROOM } from "../../realtime/io.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";
import {
  settle,
  startRealtimeHarness,
  type RealtimeHarness,
} from "../../testing/realtimeHarness.js";
import { bootstrapSuperadmin } from "./admin.service.js";
import { SYSTEM_ACTOR_ID } from "./superadmin.js";

let client: TestClient;
let harness: RealtimeHarness;

async function confirmed(name: string): Promise<TestUser> {
  const user = await makeUser(name);

  await prisma.users.update({ where: { id: user.id }, data: { email_verified_at: new Date() } });

  return user;
}

async function makeSuperadmin(name: string): Promise<TestUser> {
  const user = await confirmed(name);

  await prisma.users.update({ where: { id: user.id }, data: { org_role: "superadmin" } });

  return user;
}

const roleOf = async (user: TestUser) =>
  (await prisma.users.findUniqueOrThrow({ where: { id: user.id }, select: { org_role: true } }))
    .org_role;

const auditRows = () =>
  prisma.admin_audit_log.findMany({
    where: { action: { startsWith: "user.superadmin" } },
    orderBy: { created_at: "asc" },
  });

const setRole = (actor: TestUser, target: { id: string }, superadmin: boolean) =>
  client.put<{ outcome: string; account: { org_role: string } }>(
    `/api/v1/admin/accounts/${target.id}/superadmin`,
    { superadmin },
    { token: actor.token },
  );

beforeAll(async () => {
  client = await startTestServer();
  harness = await startRealtimeHarness();
});

beforeEach(resetDatabase);

afterEach(() => harness.reset());

afterAll(async () => {
  await harness.close();
  await client.close();
  await disconnect();
});

describe("who may reach account administration", () => {
  it("answers 401 without a session", async () => {
    expect((await client.get("/api/v1/admin/accounts")).status).toBe(401);
  });

  it("answers 404 to an ordinary user, and changes nothing", async () => {
    const user = await confirmed("ordinary");
    const target = await confirmed("target");

    expect((await client.get("/api/v1/admin/accounts", { token: user.token })).status).toBe(404);
    expect((await setRole(user, user, true)).status).toBe(404);
    expect((await setRole(user, target, true)).status).toBe(404);
    expect(await roleOf(user)).toBe("member");
    expect(await auditRows()).toHaveLength(0);
  });

  // A board's admin or owner is a board role: it never reaches the global one.
  it("answers 404 to a board owner and a board admin", async () => {
    const owner = await confirmed("owner");
    const boardAdmin = await confirmed("boardadmin");

    await addMember(owner.boardId, boardAdmin, "admin", owner.id);

    expect((await setRole(owner, owner, true)).status).toBe(404);
    expect((await setRole(boardAdmin, boardAdmin, true)).status).toBe(404);
    expect(await roleOf(owner)).toBe("member");
    expect(await roleOf(boardAdmin)).toBe("member");
  });
});

describe("GET /admin/accounts", () => {
  it("lists accounts with their status and role, and nothing private", async () => {
    const admin = await makeSuperadmin("root");
    await makeUser("pending");

    const response = await client.get<{
      accounts: Record<string, unknown>[];
      superadmins: { id: string }[];
      active_superadmins: number;
    }>("/api/v1/admin/accounts", { token: admin.token });

    expect(response.status).toBe(200);
    expect(response.body.active_superadmins).toBe(1);
    expect(response.body.superadmins.map((row) => row.id)).toEqual([admin.id]);

    for (const account of response.body.accounts) {
      expect(Object.keys(account).sort()).toEqual(
        ["avatar_url", "created_at", "email", "full_name", "id", "org_role", "status", "username"],
      );
    }

    expect(response.body.accounts.map((row) => row.status).sort()).toEqual(["active", "unverified"]);
  });

  it("searches by username or email, treating LIKE wildcards as text", async () => {
    const admin = await makeSuperadmin("root");
    const target = await makeUser("findme");

    const byName = await client.get<{ accounts: { id: string }[] }>(
      `/api/v1/admin/accounts?q=${target.username.slice(0, 10)}`,
      { token: admin.token },
    );
    const wildcard = await client.get<{ accounts: { id: string }[] }>(
      "/api/v1/admin/accounts?q=%25",
      { token: admin.token },
    );

    expect(byName.body.accounts.map((row) => row.id)).toEqual([target.id]);
    expect(wildcard.body.accounts).toEqual([]);
  });
});

describe("granting and revoking the superadmin role", () => {
  it("grants, records who did it to whom, and takes effect on the next request", async () => {
    const admin = await makeSuperadmin("root");
    const target = await confirmed("target");

    const response = await setRole(admin, target, true);

    expect(response.status).toBe(200);
    expect(response.body.outcome).toBe("granted");
    expect(await roleOf(target)).toBe("superadmin");
    expect((await client.get("/api/v1/admin/ping", { token: target.token })).status).toBe(200);

    const [row] = await auditRows();

    expect(row).toMatchObject({
      actor_id: admin.id,
      action: "user.superadmin_granted",
      target_type: "user",
      target_id: target.id,
      payload: { from: "member", to: "superadmin", via: "admin_panel" },
    });
  });

  it("is idempotent, and a repeat writes no second record", async () => {
    const admin = await makeSuperadmin("root");
    const target = await confirmed("target");

    await setRole(admin, target, true);
    const again = await setRole(admin, target, true);

    expect(again.status).toBe(200);
    expect(again.body.outcome).toBe("unchanged");
    expect(await auditRows()).toHaveLength(1);
  });

  it("refuses an unconfirmed or deactivated account, and records the refusal", async () => {
    const admin = await makeSuperadmin("root");
    const unconfirmed = await makeUser("unconfirmed");
    const gone = await confirmed("gone");

    await prisma.users.update({ where: { id: gone.id }, data: { deactivated_at: new Date() } });

    const first = await setRole(admin, unconfirmed, true);
    const second = await setRole(admin, gone, true);

    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
    expect(await roleOf(unconfirmed)).toBe("member");
    expect(await roleOf(gone)).toBe("member");
    expect((await auditRows()).map((row) => row.payload)).toEqual([
      { grant: true, reason: "unverified", via: "admin_panel" },
      { grant: true, reason: "deactivated", via: "admin_panel" },
    ]);
  });

  it("answers 404 for an unknown account and 400 for a malformed id or an extra field", async () => {
    const admin = await makeSuperadmin("root");

    expect((await setRole(admin, { id: "00000000-0000-4000-8000-000000000000" }, true)).status).toBe(404);
    expect((await setRole(admin, { id: "not-a-uuid" }, true)).status).toBe(400);

    const extra = await client.put(
      `/api/v1/admin/accounts/${admin.id}/superadmin`,
      { superadmin: true, org_role: "director" },
      { token: admin.token },
    );

    expect(extra.status).toBe(400);
  });

  it("refuses to remove the last superadmin, even by their own hand", async () => {
    const admin = await makeSuperadmin("root");

    const response = await setRole(admin, admin, false);

    expect(response.status).toBe(409);
    expect(await roleOf(admin)).toBe("superadmin");

    const [row] = await auditRows();

    expect(row).toMatchObject({
      action: "user.superadmin_refused",
      payload: { grant: false, reason: "last_superadmin" },
    });
  });

  it("revokes when another remains, and the same token loses access at once", async () => {
    const admin = await makeSuperadmin("root");
    const other = await makeSuperadmin("other");

    const response = await setRole(admin, other, false);

    expect(response.status).toBe(200);
    expect(response.body.outcome).toBe("revoked");
    expect((await client.get("/api/v1/admin/ping", { token: other.token })).status).toBe(404);
  });

  it("leaves exactly one superadmin when the last two revoke each other at once", async () => {
    const a = await makeSuperadmin("alpha");
    const b = await makeSuperadmin("bravo");

    const statuses = (await Promise.all([setRole(a, b, false), setRole(b, a, false)])).map(
      (response) => response.status,
    );

    const remaining = await prisma.users.count({ where: { org_role: "superadmin" } });

    expect(remaining).toBe(1);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
  });

  it("turns a revoked superadmin's open socket out of the admin room", async () => {
    const admin = await makeSuperadmin("root");
    const other = await makeSuperadmin("other");
    const socket = await harness.connect(other.token);

    await socket.joinAdmin();
    expect(harness.io.sockets.adapter.rooms.get(ADMIN_ROOM)?.size).toBe(1);

    await setRole(admin, other, false);
    await settle();

    expect(harness.io.sockets.adapter.rooms.get(ADMIN_ROOM)).toBeUndefined();
  });
});

describe("GET /admin/audit?action=", () => {
  it("narrows to role changes and names the account each one was about", async () => {
    const admin = await makeSuperadmin("root");
    const target = await confirmed("target");

    await setRole(admin, target, true);
    await prisma.admin_audit_log.create({
      data: { actor_id: admin.id, action: "kpi_target.updated", target_type: "kpi_target" },
    });

    const response = await client.get<{
      entries: { action: string; target_username: string | null }[];
    }>("/api/v1/admin/audit?action=user.superadmin", { token: admin.token });

    expect(response.body.entries).toEqual([
      expect.objectContaining({
        action: "user.superadmin_granted",
        target_username: target.username,
      }),
    ]);
  });
});

describe("bootstrapping the first superadmin", () => {
  it("previews without changing anything", async () => {
    const user = await confirmed("first");

    const result = await bootstrapSuperadmin(user.email.toUpperCase(), undefined);

    expect(result).toMatchObject({ kind: "preview", activeSuperadmins: 0 });
    expect(await roleOf(user)).toBe("member");
  });

  it("grants on the matching id, as the system, and is safe to run again", async () => {
    const user = await confirmed("first");

    expect(await bootstrapSuperadmin(user.email, user.id)).toMatchObject({
      kind: "done",
      outcome: "granted",
    });
    expect(await bootstrapSuperadmin(user.email, user.id)).toMatchObject({
      kind: "done",
      outcome: "unchanged",
    });
    expect(await roleOf(user)).toBe("superadmin");

    const rows = await auditRows();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_id: SYSTEM_ACTOR_ID,
      target_id: user.id,
      payload: { via: "bootstrap_cli" },
    });
  });

  it("refuses an id that is not the account the email names", async () => {
    const user = await confirmed("first");
    const other = await confirmed("other");

    expect(await bootstrapSuperadmin(user.email, other.id)).toEqual({ kind: "mismatch" });
    expect(await roleOf(user)).toBe("member");
    expect(await roleOf(other)).toBe("member");
  });

  it("refuses once an active superadmin exists", async () => {
    await makeSuperadmin("root");
    const user = await confirmed("second");

    expect(await bootstrapSuperadmin(user.email, user.id)).toMatchObject({ kind: "refused" });
    expect(await roleOf(user)).toBe("member");
  });

  it("refuses an unconfirmed account and an unknown email", async () => {
    const user = await makeUser("unconfirmed");

    expect(await bootstrapSuperadmin(user.email, user.id)).toMatchObject({ kind: "refused" });
    expect(await bootstrapSuperadmin("nobody@test.invalid", undefined)).toEqual({
      kind: "no_account",
    });
  });
});
