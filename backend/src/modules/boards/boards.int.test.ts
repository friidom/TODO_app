import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(resetDatabase);

afterAll(async () => {
  await client.close();
  await disconnect();
});

interface Board {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: string;
  space_id: string | null;
  next_key: number;
  key_prefix: string;
}

describe("GET /boards", () => {
  it("needs a token", async () => {
    expect((await client.get("/api/v1/boards")).status).toBe(401);
  });

  it("returns the board provisioning gave the caller", async () => {
    const alice = await makeUser("alice");
    const response = await client.get<Board[]>("/api/v1/boards", { token: alice.token });

    expect(response.status).toBe(200);
    expect(response.body.map((b) => b.id)).toEqual([alice.boardId]);
  });

  it("does not return a board the caller has no membership on", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const response = await client.get<Board[]>("/api/v1/boards", { token: alice.token });

    expect(response.body.map((b) => b.id)).not.toContain(mallory.boardId);
  });

  it("returns a board the caller was added to, as well as their own", async () => {
    const [alice, viewer] = [await makeUser("alice"), await makeUser("viewer")];

    await addMember(alice.boardId, viewer, "viewer", alice.id);

    const response = await client.get<Board[]>("/api/v1/boards", { token: viewer.token });

    expect(new Set(response.body.map((b) => b.id))).toEqual(
      new Set([viewer.boardId, alice.boardId]),
    );
  });

  it("orders by created_at so the list is stable between calls", async () => {
    const alice = await makeUser("alice");

    for (const title of ["second", "third"]) {
      await client.post("/api/v1/boards", { title }, { token: alice.token });
    }

    const response = await client.get<Board[]>("/api/v1/boards", { token: alice.token });
    const times = await prisma.boards.findMany({
      where: { id: { in: response.body.map((b) => b.id) } },
      select: { id: true, created_at: true },
    });
    const at = new Map(times.map((t) => [t.id, t.created_at.getTime()]));

    const ordered = response.body.map((b) => at.get(b.id)!);

    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
  });
});

describe("POST /boards", () => {
  it("creates a board owned by the caller", async () => {
    const alice = await makeUser("alice");
    const response = await client.post<Board>(
      "/api/v1/boards",
      { title: "Roadmap" },
      { token: alice.token },
    );

    expect(response.status).toBe(201);
    expect(response.body.owner_id).toBe(alice.id);
    expect(response.body.title).toBe("Roadmap");
    expect(response.body.visibility).toBe("private");
  });

  it("honours a client-minted id, so the optimistic row is the stored row", async () => {
    const alice = await makeUser("alice");
    const id = randomUUID();
    const response = await client.post<Board>(
      "/api/v1/boards",
      { id, title: "Minted" },
      { token: alice.token },
    );

    expect(response.body.id).toBe(id);
  });

  it("IGNORES owner_id in the body rather than trusting it", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const response = await client.post<Board>(
      "/api/v1/boards",
      { title: "Forged", owner_id: mallory.id },
      { token: alice.token },
    );

    expect(response.status).toBe(201);
    expect(response.body.owner_id).toBe(alice.id);
  });

  it("IGNORES next_key and key_prefix in the body", async () => {
    const alice = await makeUser("alice");
    const response = await client.post<Board>(
      "/api/v1/boards",
      { title: "Forged", next_key: 9999, key_prefix: "ZZZ" },
      { token: alice.token },
    );

    expect(response.body.next_key).toBe(1);
    expect(response.body.key_prefix).toBe("KAN");
  });

  it("writes exactly one owner membership, from the trigger and not the service", async () => {
    const alice = await makeUser("alice");
    const created = await client.post<Board>(
      "/api/v1/boards",
      { title: "Roadmap" },
      { token: alice.token },
    );

    const members = await prisma.board_members.findMany({
      where: { board_id: created.body.id },
      select: { user_id: true, role: true },
    });

    expect(members).toEqual([{ user_id: alice.id, role: "owner" }]);
  });

  it("stamps the activity with the actor, which is what withActor is for", async () => {
    const alice = await makeUser("alice");
    const created = await client.post<Board>(
      "/api/v1/boards",
      { title: "Roadmap" },
      { token: alice.token },
    );

    const activities = await prisma.activities.findMany({
      where: { board_id: created.body.id },
      select: { actor_id: true, entity_type: true, action: true },
    });

    expect(activities.length).toBeGreaterThan(0);
    for (const row of activities) expect(row.actor_id).toBe(alice.id);
  });

  it("refuses creating a board already filed into someone else's space", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const theirSpace = await client.post<{ id: string }>(
      "/api/v1/spaces",
      { title: "Theirs" },
      { token: mallory.token },
    );

    const response = await client.post(
      "/api/v1/boards",
      { title: "Sneaky", space_id: theirSpace.body.id },
      { token: alice.token },
    );

    expect(response.status).toBe(403);
    expect(await prisma.boards.count({ where: { space_id: theirSpace.body.id } })).toBe(0);
  });

  it("creates a board filed into the caller's own space", async () => {
    const alice = await makeUser("alice");
    const mine = await client.post<{ id: string }>(
      "/api/v1/spaces",
      { title: "Mine" },
      { token: alice.token },
    );

    const response = await client.post<Board>(
      "/api/v1/boards",
      { title: "Filed", space_id: mine.body.id },
      { token: alice.token },
    );

    expect(response.status).toBe(201);
    expect(response.body.space_id).toBe(mine.body.id);
  });

  it("refuses a space_id that names nothing", async () => {
    const alice = await makeUser("alice");
    const response = await client.post(
      "/api/v1/boards",
      { title: "Dangling", space_id: randomUUID() },
      { token: alice.token },
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("rejects a blank title", async () => {
    const alice = await makeUser("alice");

    expect(
      (await client.post("/api/v1/boards", { title: "   " }, { token: alice.token })).status,
    ).toBe(400);
  });

  it("rejects a missing title", async () => {
    const alice = await makeUser("alice");

    expect((await client.post("/api/v1/boards", {}, { token: alice.token })).status).toBe(400);
  });
});

describe("GET /boards/:boardId", () => {
  it("lets a member read it", async () => {
    const alice = await makeUser("alice");
    const response = await client.get<Board>(`/api/v1/boards/${alice.boardId}`, {
      token: alice.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(alice.boardId);
  });

  it("answers 404 — not 403 — for a non-member, identically to a board that does not exist", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];

    const foreign = await client.get(`/api/v1/boards/${alice.boardId}`, { token: mallory.token });
    const absent = await client.get(`/api/v1/boards/${randomUUID()}`, { token: mallory.token });

    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(absent.body));
  });

  it("answers the same 404 for a malformed id", async () => {
    const alice = await makeUser("alice");
    const response = await client.get("/api/v1/boards/not-a-uuid", { token: alice.token });

    expect(response.status).toBe(404);
  });

  it("is 401 before any board lookup when no token is presented", async () => {
    const alice = await makeUser("alice");

    expect((await client.get(`/api/v1/boards/${alice.boardId}`)).status).toBe(401);
  });

  it("serialises next_key as a JSON number", async () => {
    const alice = await makeUser("alice");
    const response = await client.get<Board>(`/api/v1/boards/${alice.boardId}`, {
      token: alice.token,
    });

    expect(typeof response.body.next_key).toBe("number");
  });
});

describe("PATCH /boards/:boardId", () => {
  async function boardWith(role: "viewer" | "editor" | "admin") {
    const owner = await makeUser("owner");
    const member = await makeUser(role);

    await addMember(owner.boardId, member, role, owner.id);

    return { owner, member };
  }

  it("refuses a viewer and an editor with 403", async () => {
    for (const role of ["viewer", "editor"] as const) {
      const { owner, member } = await boardWith(role);
      const response = await client.patch(
        `/api/v1/boards/${owner.boardId}`,
        { title: "Renamed" },
        { token: member.token },
      );

      expect(response.status, role).toBe(403);
      await resetDatabase();
    }
  });

  it("allows an admin", async () => {
    const { owner, member } = await boardWith("admin");
    const response = await client.patch<Board>(
      `/api/v1/boards/${owner.boardId}`,
      { title: "Renamed", description: "desc", icon: "rocket", cover_color: "#fff" },
      { token: member.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("Renamed");
  });

  it("answers 404, not 403, for a non-member", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}`,
      { title: "Renamed" },
      { token: mallory.token },
    );

    expect(response.status).toBe(404);
  });

  it("IGNORES owner_id, next_key and key_prefix in the patch", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];

    const response = await client.patch<Board>(
      `/api/v1/boards/${alice.boardId}`,
      { title: "Still mine", owner_id: mallory.id, next_key: 500, key_prefix: "ZZZ" },
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.owner_id).toBe(alice.id);
    expect(response.body.next_key).toBe(1);
    expect(response.body.key_prefix).toBe("KAN");
  });

  it("rejects a visibility outside the CHECK", async () => {
    const alice = await makeUser("alice");
    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}`,
      { visibility: "public" },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
  });

  it("accepts the two visibilities the CHECK allows", async () => {
    const alice = await makeUser("alice");

    for (const visibility of ["team", "private"]) {
      const response = await client.patch<Board>(
        `/api/v1/boards/${alice.boardId}`,
        { visibility },
        { token: alice.token },
      );

      expect(response.status, visibility).toBe(200);
      expect(response.body.visibility).toBe(visibility);
    }
  });

  it("rejects an empty patch", async () => {
    const alice = await makeUser("alice");

    expect(
      (await client.patch(`/api/v1/boards/${alice.boardId}`, {}, { token: alice.token })).status,
    ).toBe(400);
  });

  it("rejects a patch whose only keys are unknown, because they are stripped", async () => {
    const alice = await makeUser("alice");
    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}`,
      { owner_id: randomUUID() },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
  });
});

describe("PATCH /boards/:boardId — the space filing rule", () => {
  async function makeSpace(user: TestUser, title = "Space") {
    const response = await client.post<{ id: string }>(
      "/api/v1/spaces",
      { title },
      { token: user.token },
    );

    return response.body.id;
  }

  it("files a board into a space the owner owns", async () => {
    const alice = await makeUser("alice");
    const spaceId = await makeSpace(alice);

    const response = await client.patch<Board>(
      `/api/v1/boards/${alice.boardId}`,
      { space_id: spaceId },
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.space_id).toBe(spaceId);
  });

  it("refuses filing into a space owned by someone else", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const theirSpace = await makeSpace(mallory);

    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}`,
      { space_id: theirSpace },
      { token: alice.token },
    );

    expect(response.status).toBe(403);
  });

  it("refuses an admin who is not the board owner, even into their own space", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");

    await addMember(owner.boardId, admin, "admin", owner.id);

    const adminsOwnSpace = await makeSpace(admin);

    const response = await client.patch(
      `/api/v1/boards/${owner.boardId}`,
      { space_id: adminsOwnSpace },
      { token: admin.token },
    );

    expect(response.status).toBe(403);
  });

  it("always allows unfiling", async () => {
    const alice = await makeUser("alice");
    const spaceId = await makeSpace(alice);

    await client.patch(
      `/api/v1/boards/${alice.boardId}`,
      { space_id: spaceId },
      { token: alice.token },
    );

    const response = await client.patch<Board>(
      `/api/v1/boards/${alice.boardId}`,
      { space_id: null },
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.space_id).toBeNull();
  });

  // Deliberate, per §11.3: "unfiling is always allowed; filing requires
  // owning both". boards_space_ownership returns early when space_id is null,
  // so an admin can unfile a board from the owner's folder. Pinned here so it
  // reads as a decision rather than an oversight.
  it("lets a non-owner admin UNFILE, which the trigger deliberately permits", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");

    await addMember(owner.boardId, admin, "admin", owner.id);

    const space = await client.post<{ id: string }>(
      "/api/v1/spaces",
      { title: "Folder" },
      { token: owner.token },
    );

    await client.patch(
      `/api/v1/boards/${owner.boardId}`,
      { space_id: space.body.id },
      { token: owner.token },
    );

    const response = await client.patch<Board>(
      `/api/v1/boards/${owner.boardId}`,
      { space_id: null },
      { token: admin.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.space_id).toBeNull();
  });

  it("leaves an admin free to change everything else while a space is set", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");

    await addMember(owner.boardId, admin, "admin", owner.id);

    const spaceId = await makeSpace(owner);

    await client.patch(
      `/api/v1/boards/${owner.boardId}`,
      { space_id: spaceId },
      { token: owner.token },
    );

    const response = await client.patch<Board>(
      `/api/v1/boards/${owner.boardId}`,
      { title: "Renamed by admin" },
      { token: admin.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.space_id).toBe(spaceId);
  });
});

describe("client-minted ids, and what they cost", () => {
  // Honouring a client-chosen primary key and hiding whether that key is
  // taken are mutually exclusive. BoardFormModal mints the id and navigates
  // to it before the response arrives, so the id must be honoured; the
  // residual oracle costs 122 bits of guessing and is an accepted trade-off.
  it("answers 409 for an id that is already taken, whoever owns it", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];

    const taken = await client.post<{ error: { code: string } }>(
      "/api/v1/boards",
      { id: alice.boardId, title: "probe" },
      { token: mallory.token },
    );

    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("conflict");
  });

  it("does not let the collision reveal or alter the other board", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];

    await client.post(
      "/api/v1/boards",
      { id: alice.boardId, title: "probe" },
      { token: mallory.token },
    );

    const board = await prisma.boards.findUniqueOrThrow({
      where: { id: alice.boardId },
      select: { owner_id: true, title: true },
    });

    expect(board.owner_id).toBe(alice.id);
    expect(board.title).not.toBe("probe");
    expect(
      (await client.get(`/api/v1/boards/${alice.boardId}`, { token: mallory.token })).status,
    ).toBe(404);
  });
});

describe("DELETE /boards/:boardId", () => {
  it("refuses an admin with 403", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");

    await addMember(owner.boardId, admin, "admin", owner.id);

    expect(
      (await client.del(`/api/v1/boards/${owner.boardId}`, undefined, { token: admin.token }))
        .status,
    ).toBe(403);
  });

  it("answers 404 for a non-member", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];

    expect(
      (await client.del(`/api/v1/boards/${alice.boardId}`, undefined, { token: mallory.token }))
        .status,
    ).toBe(404);
  });

  // This failed twice in production SQL (§21.11, §21.12): log_member_activity
  // and log_*_activity wrote an activities row referencing a board the cascade
  // had already removed. Every provisioned board has four columns and one
  // membership, so this shape is the one that broke.
  it("deletes a board that has columns and a membership, cascading both", async () => {
    const alice = await makeUser("alice");

    expect(await prisma.columns.count({ where: { board_id: alice.boardId } })).toBe(4);

    const response = await client.del(`/api/v1/boards/${alice.boardId}`, undefined, {
      token: alice.token,
    });

    expect(response.status).toBe(204);
    expect(await prisma.boards.count({ where: { id: alice.boardId } })).toBe(0);
    expect(await prisma.columns.count({ where: { board_id: alice.boardId } })).toBe(0);
    expect(await prisma.board_members.count({ where: { board_id: alice.boardId } })).toBe(0);
    expect(await prisma.activities.count({ where: { board_id: alice.boardId } })).toBe(0);
  });

  it("takes the board's todos with it", async () => {
    const alice = await makeUser("alice");
    const column = await prisma.columns.findFirstOrThrow({
      where: { board_id: alice.boardId },
      select: { id: true },
    });

    await prisma.todos.create({
      data: { board_id: alice.boardId, column_id: column.id, title: "doomed" },
    });

    await client.del(`/api/v1/boards/${alice.boardId}`, undefined, { token: alice.token });

    expect(await prisma.todos.count({ where: { board_id: alice.boardId } })).toBe(0);
  });

  it("leaves other boards alone", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];

    await client.del(`/api/v1/boards/${alice.boardId}`, undefined, { token: alice.token });

    expect(await prisma.boards.count({ where: { id: mallory.boardId } })).toBe(1);
  });
});

// Board Settings > Features (migration 0020). The flags ride on the board's
// existing PATCH rather than a /settings route of its own: a board already has
// one admin-gated update, and a second endpoint would be a second place for the
// authorization to be wrong.
describe("board feature flags", () => {
  interface Flags {
    sprints_enabled: boolean;
    workflow_enabled: boolean;
    title: string | null;
  }

  function settings(actor: TestUser, boardId: string, patch: Record<string, unknown>) {
    return client.patch<Flags>(`/api/v1/boards/${boardId}`, patch, { token: actor.token });
  }

  it("both default on, so 0020 changed no behaviour on deploy", async () => {
    const alice = await makeUser("alice");

    const listed = await client.get<Flags[]>("/api/v1/boards", { token: alice.token });

    expect(listed.body[0]!.sprints_enabled).toBe(true);
    expect(listed.body[0]!.workflow_enabled).toBe(true);
  });

  it("lets an admin turn each off and back on", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");

    await addMember(owner.boardId, admin, "admin", owner.id);

    const off = await settings(admin, owner.boardId, {
      sprints_enabled: false,
      workflow_enabled: false,
    });

    expect(off.status).toBe(200);
    expect(off.body.sprints_enabled).toBe(false);
    expect(off.body.workflow_enabled).toBe(false);

    const on = await settings(admin, owner.boardId, { sprints_enabled: true });

    expect(on.body.sprints_enabled).toBe(true);
    // Untouched by a patch that did not name it.
    expect(on.body.workflow_enabled).toBe(false);
  });

  it("REFUSES an editor and a viewer, leaving the flags alone", async () => {
    const owner = await makeUser("owner");
    const editor = await makeUser("editor");
    const viewer = await makeUser("viewer");

    await addMember(owner.boardId, editor, "editor", owner.id);
    await addMember(owner.boardId, viewer, "viewer", owner.id);

    expect((await settings(editor, owner.boardId, { sprints_enabled: false })).status).toBe(403);
    expect((await settings(viewer, owner.boardId, { sprints_enabled: false })).status).toBe(403);

    const row = await prisma.boards.findUniqueOrThrow({ where: { id: owner.boardId } });

    expect(row.sprints_enabled).toBe(true);
  });

  it("answers 404 for a non-member and 401 with no token", async () => {
    const owner = await makeUser("owner");
    const outsider = await makeUser("outsider");

    expect((await settings(outsider, owner.boardId, { sprints_enabled: false })).status).toBe(404);
    expect(
      (await client.patch(`/api/v1/boards/${owner.boardId}`, { sprints_enabled: false })).status,
    ).toBe(401);
  });

  it("does not disturb the flags when only the title is patched", async () => {
    const owner = await makeUser("owner");

    await settings(owner, owner.boardId, { workflow_enabled: false });

    const renamed = await settings(owner, owner.boardId, { title: "Renamed" });

    expect(renamed.body.title).toBe("Renamed");
    expect(renamed.body.workflow_enabled).toBe(false);
  });
});
