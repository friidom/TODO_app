import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { disconnect, resetDatabase } from "../testing/db.js";
import { addMember, makeUser } from "../testing/fixtures.js";
import { startRealtimeHarness, settle, type RealtimeHarness } from "../testing/realtimeHarness.js";
import { startTestServer, type TestClient } from "../testing/httpClient.js";
import * as membersService from "../modules/members/members.service.js";
import { boardRoom } from "./io.js";

let harness: RealtimeHarness;
let rest: TestClient;

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

describe("board:join authorization", () => {
  it("lets a member of the board in", async () => {
    const owner = await makeUser("owner");
    const socket = await harness.connect(owner.token);

    await expect(socket.join(owner.boardId)).resolves.toEqual({ ok: true });
    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))?.size).toBe(1);
  });

  it("refuses a board the caller is not a member of", async () => {
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");
    const socket = await harness.connect(stranger.token);

    await expect(socket.join(owner.boardId)).resolves.toEqual({ ok: false });
    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))).toBeUndefined();
  });

  it("refuses a board that does not exist, and a malformed id, without throwing", async () => {
    const owner = await makeUser("owner");
    const socket = await harness.connect(owner.token);

    await expect(socket.join(randomUUID())).resolves.toEqual({ ok: false });
    await expect(socket.join("not-a-uuid")).resolves.toEqual({ ok: false });
  });

  it("admits a viewer — every board role may read", async () => {
    const owner = await makeUser("owner");
    const viewer = await makeUser("viewer");

    await addMember(owner.boardId, viewer, "viewer", owner.id);

    const socket = await harness.connect(viewer.token);

    await expect(socket.join(owner.boardId)).resolves.toEqual({ ok: true });
  });

  it("holds several boards on one socket, and each is checked on its own", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");

    await addMember(other.boardId, owner, "editor", other.id);

    const socket = await harness.connect(owner.token);

    await expect(socket.join(owner.boardId)).resolves.toEqual({ ok: true });
    await expect(socket.join(other.boardId)).resolves.toEqual({ ok: true });

    const third = await makeUser("third");

    await expect(socket.join(third.boardId)).resolves.toEqual({ ok: false });
  });

  it("leaves a board on request without touching the other one", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");

    await addMember(other.boardId, owner, "editor", other.id);

    const socket = await harness.connect(owner.token);

    await socket.join(owner.boardId);
    await socket.join(other.boardId);

    socket.leave(owner.boardId);
    await settle();

    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))).toBeUndefined();
    expect(harness.io.sockets.adapter.rooms.get(boardRoom(other.boardId))?.size).toBe(1);
  });
});

describe("forced eviction on membership change", () => {
  it("throws a removed member out of the room, every tab at once", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);

    const tabOne = await harness.connect(member.token);
    const tabTwo = await harness.connect(member.token);

    await tabOne.join(owner.boardId);
    await tabTwo.join(owner.boardId);

    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))?.size).toBe(2);

    await membersService.remove({ id: owner.id }, { id: owner.boardId, role: "owner" }, member.id);

    await tabOne.waitFor<{ boardId: string }>("board:evicted");
    await tabTwo.waitFor<{ boardId: string }>("board:evicted");

    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))).toBeUndefined();
  });

  it("evicts from the board that changed and no other", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);
    await addMember(other.boardId, member, "editor", other.id);

    const socket = await harness.connect(member.token);

    await socket.join(owner.boardId);
    await socket.join(other.boardId);

    await membersService.remove({ id: owner.id }, { id: owner.boardId, role: "owner" }, member.id);

    await socket.waitFor<{ boardId: string }>("board:evicted");

    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))).toBeUndefined();
    expect(harness.io.sockets.adapter.rooms.get(boardRoom(other.boardId))?.size).toBe(1);
  });

  it("leaves an unrelated member's socket alone", async () => {
    const owner = await makeUser("owner");
    const stays = await makeUser("stays");
    const goes = await makeUser("goes");

    await addMember(owner.boardId, stays, "editor", owner.id);
    await addMember(owner.boardId, goes, "editor", owner.id);

    const staying = await harness.connect(stays.token);
    const going = await harness.connect(goes.token);

    await staying.join(owner.boardId);
    await going.join(owner.boardId);

    await membersService.remove({ id: owner.id }, { id: owner.boardId, role: "owner" }, goes.id);

    await going.waitFor<{ boardId: string }>("board:evicted");
    await settle();

    expect(staying.seen("board:evicted")).toHaveLength(0);
    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))?.size).toBe(1);
  });

  it("evicts someone who leaves the board themselves", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);

    const socket = await harness.connect(member.token);

    await socket.join(owner.boardId);

    await membersService.leave({ id: member.id }, { id: owner.boardId, role: "editor" });

    await socket.waitFor<{ boardId: string }>("board:evicted");

    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))).toBeUndefined();
  });

  it("does not evict on a role change — every role may still read", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "admin", owner.id);

    const socket = await harness.connect(member.token);

    await socket.join(owner.boardId);

    await membersService.setRole(
      { id: owner.id },
      { id: owner.boardId, role: "owner" },
      member.id,
      { role: "viewer" },
    );

    await settle();

    expect(socket.seen("board:evicted")).toHaveLength(0);
    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))?.size).toBe(1);
  });
});

describe("the REST API alongside it", () => {
  it("still answers while sockets are connected", async () => {
    const owner = await makeUser("owner");
    const socket = await harness.connect(owner.token);

    await socket.join(owner.boardId);

    const response = await rest.get(`/api/v1/boards/${owner.boardId}`, { token: owner.token });

    expect(response.status).toBe(200);
  });
});
