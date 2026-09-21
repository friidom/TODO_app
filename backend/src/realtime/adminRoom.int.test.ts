import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../db/prisma.js";
import { disconnect, resetDatabase } from "../testing/db.js";
import { firstColumnOf, makeUser, type TestUser } from "../testing/fixtures.js";
import { startRealtimeHarness, settle, type RealtimeHarness } from "../testing/realtimeHarness.js";
import { startTestServer, type TestClient } from "../testing/httpClient.js";
import { ADMIN_ROOM } from "./io.js";

let harness: RealtimeHarness;
let rest: TestClient;

interface AdminActivityEvent {
  boardId: string;
  entity: string;
  entityId: string | null;
}

async function makeSuperadmin(name: string): Promise<TestUser> {
  const user = await makeUser(name);

  await prisma.users.update({ where: { id: user.id }, data: { org_role: "superadmin" } });

  return user;
}

async function touch(user: TestUser, boardId: string): Promise<string> {
  const id = randomUUID();

  await rest.patch(
    `/api/v1/boards/${boardId}/todos/${id}`,
    { title: "card", column_id: (await firstColumnOf(boardId)).id, rank: 1 },
    { token: user.token },
  );

  return id;
}

beforeAll(async () => {
  harness = await startRealtimeHarness();
  rest = await startTestServer();
});

beforeEach(resetDatabase);

afterEach(() => harness.reset());

afterAll(async () => {
  await harness.close();
  await rest.close();
  await disconnect();
});

describe("admin:join authorization", () => {
  it("lets a superadmin watch the system", async () => {
    const admin = await makeSuperadmin("root");
    const socket = await harness.connect(admin.token);

    await expect(socket.joinAdmin()).resolves.toEqual({ ok: true });
    expect(harness.io.sockets.adapter.rooms.get(ADMIN_ROOM)?.size).toBe(1);
  });

  // The board rooms already refuse a non-member; this is the same rule for the
  // room that has no board.
  it("refuses an ordinary user", async () => {
    const user = await makeUser("ordinary");
    const socket = await harness.connect(user.token);

    await expect(socket.joinAdmin()).resolves.toEqual({ ok: false });
    expect(harness.io.sockets.adapter.rooms.get(ADMIN_ROOM)).toBeUndefined();
  });

  it("refuses a superadmin whose role was revoked since they signed in", async () => {
    const admin = await makeSuperadmin("root");

    await prisma.users.update({ where: { id: admin.id }, data: { org_role: "member" } });

    const socket = await harness.connect(admin.token);

    await expect(socket.joinAdmin()).resolves.toEqual({ ok: false });
  });

  it("refuses a deactivated superadmin", async () => {
    const admin = await makeSuperadmin("root");

    await prisma.users.update({ where: { id: admin.id }, data: { deactivated_at: new Date() } });

    const socket = await harness.connect(admin.token);

    await expect(socket.joinAdmin()).resolves.toEqual({ ok: false });
  });
});

describe("admin:activity fan-out", () => {
  it("reaches a superadmin who is not a member of the board", async () => {
    const admin = await makeSuperadmin("root");
    const stranger = await makeUser("stranger");
    const socket = await harness.connect(admin.token);

    await socket.joinAdmin();

    const todoId = await touch(stranger, stranger.boardId);
    const event = await socket.waitFor<AdminActivityEvent>(
      "admin:activity",
      (payload) => payload.entityId === todoId,
    );

    expect(event.boardId).toBe(stranger.boardId);
    expect(event.entity).toBe("todo");
  });

  it("names the board, so a scoped feed can ignore the ones it does not watch", async () => {
    const admin = await makeSuperadmin("root");
    const one = await makeUser("one");
    const two = await makeUser("two");
    const socket = await harness.connect(admin.token);

    await socket.joinAdmin();

    await touch(one, one.boardId);
    await touch(two, two.boardId);
    await settle();

    const boards = socket.seen<AdminActivityEvent>("admin:activity").map((e) => e.boardId);

    expect(boards).toContain(one.boardId);
    expect(boards).toContain(two.boardId);
  });

  it("carries no row, only the identity a re-read needs", async () => {
    const admin = await makeSuperadmin("root");
    const socket = await harness.connect(admin.token);

    await socket.joinAdmin();
    await touch(admin, admin.boardId);

    const event = await socket.waitFor<AdminActivityEvent>("admin:activity");

    expect(Object.keys(event).sort()).toEqual(["boardId", "entity", "entityId"]);
  });

  it("does not reach a socket that never joined", async () => {
    const admin = await makeSuperadmin("root");
    const socket = await harness.connect(admin.token);

    await touch(admin, admin.boardId);
    await settle();

    expect(socket.seen("admin:activity")).toHaveLength(0);
  });

  it("stops after admin:leave", async () => {
    const admin = await makeSuperadmin("root");
    const socket = await harness.connect(admin.token);

    await socket.joinAdmin();
    socket.leaveAdmin();
    await settle();

    await touch(admin, admin.boardId);
    await settle();

    expect(socket.seen("admin:activity")).toHaveLength(0);
  });

  it("leaves the room when the socket disconnects", async () => {
    const admin = await makeSuperadmin("root");
    const socket = await harness.connect(admin.token);

    await socket.joinAdmin();
    expect(harness.io.sockets.adapter.rooms.get(ADMIN_ROOM)?.size).toBe(1);

    await socket.disconnect();
    await settle();

    expect(harness.io.sockets.adapter.rooms.get(ADMIN_ROOM)).toBeUndefined();
  });

  it("does not reach an ordinary user's socket", async () => {
    const admin = await makeSuperadmin("root");
    const user = await makeUser("ordinary");
    const plain = await harness.connect(user.token);

    await plain.joinAdmin();
    await touch(admin, admin.boardId);
    await settle();

    expect(plain.seen("admin:activity")).toHaveLength(0);
  });
});
