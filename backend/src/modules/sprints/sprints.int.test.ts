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

interface Sprint {
  id: string;
  board_id: string;
  name: string;
  goal: string | null;
  state: string;
  rank: number;
}

function sprintsUrl(boardId: string): string {
  return `/api/v1/boards/${boardId}/sprints`;
}

async function setup(role?: "editor" | "viewer") {
  const owner = await makeUser("owner");
  const columns = await prisma.columns.findMany({
    where: { board_id: owner.boardId },
    orderBy: { rank: "asc" },
    select: { id: true, category: true },
  });

  const base = {
    owner,
    boardId: owner.boardId,
    todoColumn: columns.find((c) => c.category === "todo")!.id,
    doneColumn: columns.find((c) => c.category === "done")!.id,
  };

  if (role === undefined) return { ...base, actor: owner };

  const member = await makeUser(role);

  await addMember(owner.boardId, member, role, owner.id);

  return { ...base, actor: member };
}

async function makeSprint(actor: TestUser, boardId: string, name = "Sprint 1"): Promise<Sprint> {
  const response = await client.post<Sprint>(sprintsUrl(boardId), { name }, { token: actor.token });

  if (response.status !== 201) {
    throw new Error(`create failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

async function makeTodo(
  actor: TestUser,
  boardId: string,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const response = await client.post<{ id: string }>(
    `/api/v1/boards/${boardId}/todos`,
    body,
    { token: actor.token },
  );

  return response.body;
}

describe("sprint CRUD", () => {
  it("creates a future sprint with an appended rank", async () => {
    const { actor, boardId } = await setup();
    const first = await makeSprint(actor, boardId, "One");
    const second = await makeSprint(actor, boardId, "Two");

    expect(first.state).toBe("future");
    expect(second.rank).toBeGreaterThan(first.rank);
  });

  it("lists the board's sprints oldest first", async () => {
    const { actor, boardId } = await setup();

    await makeSprint(actor, boardId, "One");
    await makeSprint(actor, boardId, "Two");

    const response = await client.get<Sprint[]>(sprintsUrl(boardId), { token: actor.token });

    expect(response.body.map((s) => s.name)).toEqual(["One", "Two"]);
  });

  it("refuses a viewer creating and allows an editor", async () => {
    const viewer = await setup("viewer");

    expect(
      (await client.post(sprintsUrl(viewer.boardId), { name: "x" }, { token: viewer.actor.token }))
        .status,
    ).toBe(403);

    const editor = await setup("editor");

    expect(
      (await client.post(sprintsUrl(editor.boardId), { name: "x" }, { token: editor.actor.token }))
        .status,
    ).toBe(201);
  });

  // The two transitions are /start and /complete; a general patch must not be
  // a third way to reach them.
  it("CANNOT patch state", async () => {
    const { actor, boardId } = await setup();
    const sprint = await makeSprint(actor, boardId);

    const response = await client.patch(
      `/api/v1/sprints/${sprint.id}`,
      { state: "active" },
      { token: actor.token },
    );

    expect(response.status).toBe(400);

    const row = await prisma.sprints.findUniqueOrThrow({
      where: { id: sprint.id },
      select: { state: true },
    });

    expect(row.state).toBe("future");
  });

  it("ignores state alongside a field it does accept", async () => {
    const { actor, boardId } = await setup();
    const sprint = await makeSprint(actor, boardId);

    const response = await client.patch<Sprint>(
      `/api/v1/sprints/${sprint.id}`,
      { name: "Renamed", state: "active" },
      { token: actor.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Renamed");
    expect(response.body.state).toBe("future");
  });

  it("cannot reach a sprint on another board", async () => {
    const { actor } = await setup();
    const other = await makeUser("other");
    const theirSprint = await makeSprint(other, other.boardId, "Theirs");

    const patched = await client.patch(
      `/api/v1/sprints/${theirSprint.id}`,
      { name: "Stolen" },
      { token: actor.token },
    );
    const deleted = await client.del(`/api/v1/sprints/${theirSprint.id}`, undefined, {
      token: actor.token,
    });

    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);
    expect(await prisma.sprints.count({ where: { id: theirSprint.id } })).toBe(1);
  });

  it("returns the work to the backlog when a sprint is deleted, not deleting it", async () => {
    const { actor, boardId, todoColumn } = await setup();
    const sprint = await makeSprint(actor, boardId);
    const todo = await makeTodo(actor, boardId, {
      title: "Planned",
      column_id: todoColumn,
      sprint_id: sprint.id,
    });

    expect(
      (await client.del(`/api/v1/sprints/${sprint.id}`, undefined, { token: actor.token })).status,
    ).toBe(204);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { sprint_id: true },
    });

    expect(row.sprint_id).toBeNull();
  });
});

describe("POST /sprints/:sprintId/start", () => {
  it("assigns exactly the items lacking a column", async () => {
    const { actor, boardId, todoColumn, doneColumn } = await setup();
    const sprint = await makeSprint(actor, boardId);

    const uncolumned = await makeTodo(actor, boardId, { title: "backlog", sprint_id: sprint.id });
    const placed = await makeTodo(actor, boardId, {
      title: "already placed",
      column_id: doneColumn,
      sprint_id: sprint.id,
    });

    const response = await client.post<Sprint>(
      `/api/v1/sprints/${sprint.id}/start`,
      undefined,
      { token: actor.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("active");

    const rows = await prisma.todos.findMany({
      where: { id: { in: [uncolumned.id, placed.id] } },
      select: { id: true, column_id: true },
    });

    expect(rows.find((r) => r.id === uncolumned.id)!.column_id).toBe(todoColumn);
    // Starting a sprint must not move a card sideways.
    expect(rows.find((r) => r.id === placed.id)!.column_id).toBe(doneColumn);
  });

  it("refuses starting a sprint that is not future", async () => {
    const { actor, boardId } = await setup();
    const sprint = await makeSprint(actor, boardId);

    await client.post(`/api/v1/sprints/${sprint.id}/start`, undefined, { token: actor.token });

    const again = await client.post(`/api/v1/sprints/${sprint.id}/start`, undefined, {
      token: actor.token,
    });

    expect(again.status).toBe(400);
  });

  // sprints_one_active_per_board is the whole mechanism; there is no explicit
  // check, so this proves the index's 23505 becomes a clean 409.
  it("refuses a SECOND active sprint with a 409, not a 500", async () => {
    const { actor, boardId } = await setup();
    const first = await makeSprint(actor, boardId, "One");
    const second = await makeSprint(actor, boardId, "Two");

    await client.post(`/api/v1/sprints/${first.id}/start`, undefined, { token: actor.token });

    const response = await client.post<{ error: { code: string } }>(
      `/api/v1/sprints/${second.id}/start`,
      undefined,
      { token: actor.token },
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("conflict");

    expect(
      await prisma.sprints.count({ where: { board_id: boardId, state: "active" } }),
    ).toBe(1);
  });

  it("refuses a viewer BEFORE any bulk write happens", async () => {
    const { owner, actor, boardId } = await setup("viewer");
    const sprint = await makeSprint(owner, boardId);
    const todo = await makeTodo(owner, boardId, { title: "backlog", sprint_id: sprint.id });

    const response = await client.post(`/api/v1/sprints/${sprint.id}/start`, undefined, {
      token: actor.token,
    });

    expect(response.status).toBe(403);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { column_id: true },
    });

    expect(row.column_id).toBeNull();
  });

  it("refuses when the board has no todo-category column", async () => {
    const { actor, boardId } = await setup();
    const sprint = await makeSprint(actor, boardId);

    await prisma.columns.updateMany({
      where: { board_id: boardId, category: "todo" },
      data: { category: "in_progress" },
    });

    const response = await client.post(`/api/v1/sprints/${sprint.id}/start`, undefined, {
      token: actor.token,
    });

    expect(response.status).toBe(400);
  });

  it("stamps the moved activity with the actor", async () => {
    const { actor, boardId } = await setup();
    const sprint = await makeSprint(actor, boardId);

    await makeTodo(actor, boardId, { title: "backlog", sprint_id: sprint.id });
    await prisma.activities.deleteMany({ where: { board_id: boardId } });

    await client.post(`/api/v1/sprints/${sprint.id}/start`, undefined, { token: actor.token });

    const moved = await prisma.activities.findFirstOrThrow({
      where: { board_id: boardId, action: "moved" },
      select: { actor_id: true },
    });

    expect(moved.actor_id).toBe(actor.id);
  });
});

describe("POST /sprints/:sprintId/complete", () => {
  async function activeSprintWithWork() {
    const context = await setup();
    const sprint = await makeSprint(context.actor, context.boardId, "Active");

    const unfinished = await makeTodo(context.actor, context.boardId, {
      title: "unfinished",
      column_id: context.todoColumn,
      sprint_id: sprint.id,
    });
    const finished = await makeTodo(context.actor, context.boardId, {
      title: "finished",
      column_id: context.doneColumn,
      sprint_id: sprint.id,
    });

    await client.post(`/api/v1/sprints/${sprint.id}/start`, undefined, {
      token: context.actor.token,
    });

    return { ...context, sprint, unfinished, finished };
  }

  it("sends unfinished work to the backlog and leaves finished work in the sprint", async () => {
    const { actor, sprint, unfinished, finished } = await activeSprintWithWork();

    const response = await client.post<Sprint>(
      `/api/v1/sprints/${sprint.id}/complete`,
      {},
      { token: actor.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.state).toBe("completed");

    const rows = await prisma.todos.findMany({
      where: { id: { in: [unfinished.id, finished.id] } },
      select: { id: true, sprint_id: true, column_id: true },
    });

    expect(rows.find((r) => r.id === unfinished.id)!.sprint_id).toBeNull();
    // Finished work keeps its sprint: that is the record of what shipped.
    expect(rows.find((r) => r.id === finished.id)!.sprint_id).toBe(sprint.id);
  });

  it("treats an absent destination and an explicit null identically", async () => {
    const first = await activeSprintWithWork();

    await client.post(`/api/v1/sprints/${first.sprint.id}/complete`, {}, { token: first.actor.token });

    await resetDatabase();

    const second = await activeSprintWithWork();

    await client.post(
      `/api/v1/sprints/${second.sprint.id}/complete`,
      { moveToSprintId: null },
      { token: second.actor.token },
    );

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: second.unfinished.id },
      select: { sprint_id: true },
    });

    expect(row.sprint_id).toBeNull();
  });

  it("moves unfinished work into a destination sprint when one is given", async () => {
    const { actor, boardId, sprint, unfinished, finished } = await activeSprintWithWork();
    const next = await makeSprint(actor, boardId, "Next");

    await client.post(
      `/api/v1/sprints/${sprint.id}/complete`,
      { moveToSprintId: next.id },
      { token: actor.token },
    );

    const rows = await prisma.todos.findMany({
      where: { id: { in: [unfinished.id, finished.id] } },
      select: { id: true, sprint_id: true },
    });

    expect(rows.find((r) => r.id === unfinished.id)!.sprint_id).toBe(next.id);
    expect(rows.find((r) => r.id === finished.id)!.sprint_id).toBe(sprint.id);
  });

  // A backlog item in the sprint is unfinished work. SQL NOT IN would have
  // excluded it, because a null column_id makes the predicate NULL.
  it("rehomes a sprint item that has no column at all", async () => {
    const context = await setup();
    const sprint = await makeSprint(context.actor, context.boardId);

    await client.post(`/api/v1/sprints/${sprint.id}/start`, undefined, {
      token: context.actor.token,
    });

    // Added after the start, so it never got a column.
    const stray = await makeTodo(context.actor, context.boardId, {
      title: "no column",
      sprint_id: sprint.id,
    });

    await client.post(`/api/v1/sprints/${sprint.id}/complete`, {}, { token: context.actor.token });

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: stray.id },
      select: { sprint_id: true },
    });

    expect(row.sprint_id).toBeNull();
  });

  it("refuses completing a sprint that is not active", async () => {
    const { actor, boardId } = await setup();
    const sprint = await makeSprint(actor, boardId);

    expect(
      (await client.post(`/api/v1/sprints/${sprint.id}/complete`, {}, { token: actor.token }))
        .status,
    ).toBe(400);
  });

  it("refuses a destination equal to the sprint being completed", async () => {
    const { actor, sprint } = await activeSprintWithWork();

    expect(
      (
        await client.post(
          `/api/v1/sprints/${sprint.id}/complete`,
          { moveToSprintId: sprint.id },
          { token: actor.token },
        )
      ).status,
    ).toBe(400);
  });

  it("refuses a destination sprint on another board", async () => {
    const { actor, sprint } = await activeSprintWithWork();
    const other = await makeUser("other");
    const theirSprint = await makeSprint(other, other.boardId, "Theirs");

    const response = await client.post(
      `/api/v1/sprints/${sprint.id}/complete`,
      { moveToSprintId: theirSprint.id },
      { token: actor.token },
    );

    expect(response.status).toBe(404);

    const row = await prisma.sprints.findUniqueOrThrow({
      where: { id: sprint.id },
      select: { state: true },
    });

    expect(row.state).toBe("active");
  });

  it("refuses a destination that does not exist", async () => {
    const { actor, sprint } = await activeSprintWithWork();

    expect(
      (
        await client.post(
          `/api/v1/sprints/${sprint.id}/complete`,
          { moveToSprintId: randomUUID() },
          { token: actor.token },
        )
      ).status,
    ).toBe(404);
  });

  it("frees the board for a new active sprint once completed", async () => {
    const { actor, boardId, sprint } = await activeSprintWithWork();
    const next = await makeSprint(actor, boardId, "Next");

    await client.post(`/api/v1/sprints/${sprint.id}/complete`, {}, { token: actor.token });

    expect(
      (await client.post(`/api/v1/sprints/${next.id}/start`, undefined, { token: actor.token }))
        .status,
    ).toBe(200);
  });

  it("refuses a viewer", async () => {
    const { boardId, sprint } = await activeSprintWithWork();
    const viewer = await makeUser("viewer");
    const owner = await prisma.boards.findUniqueOrThrow({
      where: { id: boardId },
      select: { owner_id: true },
    });

    await addMember(boardId, viewer, "viewer", owner.owner_id);

    expect(
      (await client.post(`/api/v1/sprints/${sprint.id}/complete`, {}, { token: viewer.token }))
        .status,
    ).toBe(403);
  });
});
