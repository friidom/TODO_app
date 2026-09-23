import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, firstColumnOf, makeUser, type TestUser } from "../../testing/fixtures.js";
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

interface Todo {
  id: string;
  board_id: string;
  column_id: string | null;
  position: number | null;
  rank: number | null;
  board_key: number | null;
  title: string | null;
  type: string;
  estimate: number | null;
  [key: string]: unknown;
}

// types/data.ts TODO_FIELDS, in its order.
const TODO_FIELDS = [
  "id",
  "board_id",
  "column_id",
  "position",
  "rank",
  "board_key",
  "title",
  "type",
  "priority",
  "start_date",
  "due_date",
  "assignee_id",
  "estimate",
  "parent_id",
  "sprint_id",
  "backlog_rank",
  "creator_id",
  "created_at",
  "updated_at",
  "completed_at",
];

async function setup(role: "owner" | "editor" | "viewer" = "owner") {
  const owner = await makeUser("owner");
  const column = await firstColumnOf(owner.boardId);

  if (role === "owner") return { owner, actor: owner, boardId: owner.boardId, columnId: column.id };

  const member = await makeUser(role);

  await addMember(owner.boardId, member, role, owner.id);

  return { owner, actor: member, boardId: owner.boardId, columnId: column.id };
}

function todosUrl(boardId: string, suffix = ""): string {
  return `/api/v1/boards/${boardId}/todos${suffix}`;
}

async function makeTodo(
  actor: TestUser,
  boardId: string,
  body: Record<string, unknown>,
): Promise<Todo> {
  const response = await client.post<Todo>(todosUrl(boardId), body, { token: actor.token });

  if (response.status !== 201) {
    throw new Error(`create failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

describe("GET /boards/:boardId/todos", () => {
  it("returns the board's cards with exactly TODO_FIELDS", async () => {
    const { actor, boardId, columnId } = await setup();

    await makeTodo(actor, boardId, { title: "One", column_id: columnId });

    const response = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body[0]!).sort()).toEqual([...TODO_FIELDS].sort());
  });

  // description is the only field the detail route adds now: creator_id joined
  // the list projection for the predefined filters ("Reported by me"), which
  // cannot ask their question without it.
  it("omits description, which only the detail route returns", async () => {
    const { actor, boardId, columnId } = await setup();

    await makeTodo(actor, boardId, { title: "One", column_id: columnId, description: "secret" });

    const listed = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });

    expect(listed.body[0]).not.toHaveProperty("description");
    expect(listed.body[0]).toHaveProperty("creator_id", actor.id);
  });

  // position is int8 and estimate is numeric: JSON.stringify throws on the
  // first and turns the second into a string.
  it("serialises position and estimate as JSON numbers", async () => {
    const { actor, boardId, columnId } = await setup();

    await makeTodo(actor, boardId, { title: "One", column_id: columnId, estimate: 5 });

    const listed = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });

    expect(typeof listed.body[0]!.position).toBe("number");
    expect(listed.body[0]!.estimate).toBe(5);
    expect(typeof listed.body[0]!.estimate).toBe("number");
  });

  it("keeps null and 0 estimates distinct", async () => {
    const { actor, boardId, columnId } = await setup();

    await makeTodo(actor, boardId, { title: "zero", column_id: columnId, estimate: 0 });
    await makeTodo(actor, boardId, { title: "none", column_id: columnId });

    const listed = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });
    const byTitle = new Map(listed.body.map((t) => [t.title, t.estimate]));

    expect(byTitle.get("zero")).toBe(0);
    expect(byTitle.get("none")).toBeNull();
  });

  it("returns one flat array including subtasks", async () => {
    const { actor, boardId, columnId } = await setup();
    const epic = await makeTodo(actor, boardId, { title: "Epic", column_id: columnId, type: "Epic" });

    await makeTodo(actor, boardId, { title: "Task", column_id: columnId, parent_id: epic.id });

    const listed = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });

    expect(listed.body).toHaveLength(2);
  });

  it("orders by rank, ascending, nulls last", async () => {
    const { actor, boardId, columnId } = await setup();

    for (const title of ["a", "b", "c"]) {
      await makeTodo(actor, boardId, { title, column_id: columnId });
    }

    const listed = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });
    const ranks = listed.body.map((t) => t.rank!);

    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    expect(listed.body.map((t) => t.title)).toEqual(["a", "b", "c"]);
  });

  it("answers 404 for a non-member", async () => {
    const { boardId } = await setup();
    const outsider = await makeUser("outsider");

    expect((await client.get(todosUrl(boardId), { token: outsider.token })).status).toBe(404);
  });

  it("lets a viewer read", async () => {
    const { actor, boardId } = await setup("viewer");

    expect((await client.get(todosUrl(boardId), { token: actor.token })).status).toBe(200);
  });
});

describe("POST /boards/:boardId/todos", () => {
  it("assigns a board_key from the trigger", async () => {
    const { actor, boardId, columnId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "One", column_id: columnId });

    expect(todo.board_key).toBe(1);
  });

  it("never reuses a key after a delete", async () => {
    const { actor, boardId, columnId } = await setup();
    const first = await makeTodo(actor, boardId, { title: "One", column_id: columnId });

    await client.del(`/api/v1/todos/${first.id}`, undefined, { token: actor.token });

    const second = await makeTodo(actor, boardId, { title: "Two", column_id: columnId });

    expect(second.board_key).toBe(2);
  });

  it("appends after the column's last card", async () => {
    const { actor, boardId, columnId } = await setup();
    const first = await makeTodo(actor, boardId, { title: "One", column_id: columnId });
    const second = await makeTodo(actor, boardId, { title: "Two", column_id: columnId });

    expect(second.rank!).toBeGreaterThan(first.rank!);
  });

  it("sets creator_id from the actor, never the body", async () => {
    const { actor, boardId, columnId } = await setup();
    const stranger = await makeUser("stranger");

    const todo = await makeTodo(actor, boardId, {
      title: "One",
      column_id: columnId,
      creator_id: stranger.id,
    });

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { creator_id: true },
    });

    expect(row.creator_id).toBe(actor.id);
  });

  it("IGNORES board_id and board_key in the body", async () => {
    const { actor, boardId, columnId } = await setup();
    const other = await makeUser("other");

    const todo = await makeTodo(actor, boardId, {
      title: "One",
      column_id: columnId,
      board_id: other.boardId,
      board_key: 999,
    });

    expect(todo.board_id).toBe(boardId);
    expect(todo.board_key).toBe(1);
  });

  it("honours a client-minted id", async () => {
    const { actor, boardId, columnId } = await setup();
    const id = randomUUID();
    const todo = await makeTodo(actor, boardId, { id, title: "Minted", column_id: columnId });

    expect(todo.id).toBe(id);
  });

  it("refuses a viewer with 403", async () => {
    const { actor, boardId, columnId } = await setup("viewer");

    expect(
      (await client.post(todosUrl(boardId), { title: "x", column_id: columnId }, { token: actor.token }))
        .status,
    ).toBe(403);
  });

  it("lets an editor create", async () => {
    const { actor, boardId, columnId } = await setup("editor");

    expect(
      (await client.post(todosUrl(boardId), { title: "x", column_id: columnId }, { token: actor.token }))
        .status,
    ).toBe(201);
  });

  it("rejects a type and a priority outside the CHECKs", async () => {
    const { actor, boardId, columnId } = await setup();

    for (const body of [
      { title: "x", column_id: columnId, type: "Subtask" },
      { title: "x", column_id: columnId, priority: "urgent" },
    ]) {
      expect((await client.post(todosUrl(boardId), body, { token: actor.token })).status).toBe(400);
    }
  });

  it("rejects a negative estimate", async () => {
    const { actor, boardId, columnId } = await setup();

    expect(
      (
        await client.post(
          todosUrl(boardId),
          { title: "x", column_id: columnId, estimate: -1 },
          { token: actor.token },
        )
      ).status,
    ).toBe(400);
  });

  it("reports a date range violation as a 400, not a 500", async () => {
    const { actor, boardId, columnId } = await setup();

    const response = await client.post(
      todosUrl(boardId),
      {
        title: "x",
        column_id: columnId,
        start_date: "2026-06-02T00:00:00Z",
        due_date: "2026-06-01T00:00:00Z",
      },
      { token: actor.token },
    );

    expect(response.status).toBe(400);
  });

  it("cannot place a card in a column belonging to another board", async () => {
    const { actor, boardId } = await setup();
    const other = await makeUser("other");
    const theirColumn = await firstColumnOf(other.boardId);

    const response = await client.post(
      todosUrl(boardId),
      { title: "x", column_id: theirColumn.id },
      { token: actor.token },
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await prisma.todos.count({ where: { column_id: theirColumn.id } })).toBe(0);
  });
});

describe("the work-item hierarchy", () => {
  it("reports every violation as a clean 400, never a 500", async () => {
    const { actor, boardId, columnId } = await setup();

    const epic = await makeTodo(actor, boardId, {
      title: "Epic",
      column_id: columnId,
      type: "Epic",
    });
    const task = await makeTodo(actor, boardId, {
      title: "Task",
      column_id: columnId,
      parent_id: epic.id,
    });
    const subtask = await makeTodo(actor, boardId, {
      title: "Sub",
      column_id: columnId,
      parent_id: task.id,
    });

    const violations: [string, Record<string, unknown>][] = [
      ["an Epic with a parent", { title: "x", column_id: columnId, type: "Epic", parent_id: epic.id }],
      ["a subtask under a subtask", { title: "x", column_id: columnId, parent_id: subtask.id }],
      ["a parent from another board", { title: "x", column_id: columnId, parent_id: randomUUID() }],
      [
        "a subtask carrying its own sprint",
        { title: "x", column_id: columnId, parent_id: task.id, sprint_id: randomUUID() },
      ],
    ];

    for (const [label, body] of violations) {
      const response = await client.post(todosUrl(boardId), body, { token: actor.token });

      expect(response.status, label).toBeGreaterThanOrEqual(400);
      expect(response.status, label).toBeLessThan(500);
    }
  });

  it("refuses a cross-board parent", async () => {
    const { actor, boardId, columnId } = await setup();
    const other = await makeUser("other");
    const theirColumn = await firstColumnOf(other.boardId);
    const theirTodo = await makeTodo(other, other.boardId, {
      title: "Theirs",
      column_id: theirColumn.id,
    });

    const response = await client.post(
      todosUrl(boardId),
      { title: "x", column_id: columnId, parent_id: theirTodo.id },
      { token: actor.token },
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

describe("PATCH /boards/:boardId/todos/:todoId — upsert semantics", () => {
  // §12.3: a freshly created card can be patched before its insert lands, and
  // an update would silently match zero rows.
  it("CREATES a row for an id that does not exist yet", async () => {
    const { actor, boardId, columnId } = await setup();
    const id = randomUUID();

    const response = await client.patch<Todo>(
      todosUrl(boardId, `/${id}`),
      { title: "Made by PATCH", column_id: columnId },
      { token: actor.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
    expect(await prisma.todos.count({ where: { id } })).toBe(1);
  });

  it("updates an existing row rather than duplicating it", async () => {
    const { actor, boardId, columnId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "Before", column_id: columnId });

    const response = await client.patch<Todo>(
      todosUrl(boardId, `/${todo.id}`),
      { title: "After" },
      { token: actor.token },
    );

    expect(response.body.title).toBe("After");
    expect(await prisma.todos.count({ where: { board_id: boardId } })).toBe(1);
  });

  it("keeps the board_key it was given rather than allocating a second", async () => {
    const { actor, boardId, columnId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "One", column_id: columnId });

    const response = await client.patch<Todo>(
      todosUrl(boardId, `/${todo.id}`),
      { title: "Renamed" },
      { token: actor.token },
    );

    expect(response.body.board_key).toBe(todo.board_key);
  });

  // boardAccess does not resolve the id on this route, so the compound-key
  // write is the ONLY thing scoping it.
  it("cannot overwrite a card on another board, even with its real id", async () => {
    const { actor, boardId } = await setup();
    const other = await makeUser("other");
    const theirColumn = await firstColumnOf(other.boardId);
    const theirTodo = await makeTodo(other, other.boardId, {
      title: "Theirs",
      column_id: theirColumn.id,
    });

    const response = await client.patch(
      todosUrl(boardId, `/${theirTodo.id}`),
      { title: "Stolen" },
      { token: actor.token },
    );

    expect(response.status).toBe(409);

    const untouched = await prisma.todos.findUniqueOrThrow({
      where: { id: theirTodo.id },
      select: { title: true, board_id: true },
    });

    expect(untouched.title).toBe("Theirs");
    expect(untouched.board_id).toBe(other.boardId);
  });

  it("refuses a viewer", async () => {
    const { actor, boardId } = await setup("viewer");

    expect(
      (
        await client.patch(
          todosUrl(boardId, `/${randomUUID()}`),
          { title: "x" },
          { token: actor.token },
        )
      ).status,
    ).toBe(403);
  });

  it("answers 404 for a non-member, not a create", async () => {
    const { boardId } = await setup();
    const outsider = await makeUser("outsider");
    const id = randomUUID();

    const response = await client.patch(
      todosUrl(boardId, `/${id}`),
      { title: "x" },
      { token: outsider.token },
    );

    expect(response.status).toBe(404);
    expect(await prisma.todos.count({ where: { id } })).toBe(0);
  });
});

describe("POST /todos/:todoId/move", () => {
  it("writes exactly one row", async () => {
    const { actor, boardId, columnId } = await setup();
    const columns = await prisma.columns.findMany({
      where: { board_id: boardId },
      orderBy: { rank: "asc" },
      select: { id: true },
    });
    const destination = columns.find((c) => c.id !== columnId)!.id;

    const a = await makeTodo(actor, boardId, { title: "a", column_id: columnId });
    const b = await makeTodo(actor, boardId, { title: "b", column_id: columnId });

    const before = await prisma.todos.findUniqueOrThrow({
      where: { id: b.id },
      select: { rank: true, column_id: true },
    });

    const response = await client.post(
      `/api/v1/todos/${a.id}/move`,
      { column_id: destination, rank: 4096 },
      { token: actor.token },
    );

    expect(response.status).toBe(204);

    const moved = await prisma.todos.findUniqueOrThrow({
      where: { id: a.id },
      select: { rank: true, column_id: true },
    });
    const untouched = await prisma.todos.findUniqueOrThrow({
      where: { id: b.id },
      select: { rank: true, column_id: true },
    });

    expect(moved.column_id).toBe(destination);
    expect(moved.rank).toBe(4096);
    expect(untouched).toEqual(before);
  });

  it("takes the client's rank rather than recomputing one", async () => {
    const { actor, boardId, columnId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "a", column_id: columnId });

    await client.post(
      `/api/v1/todos/${todo.id}/move`,
      { column_id: columnId, rank: 1536.5 },
      { token: actor.token },
    );

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { rank: true },
    });

    expect(row.rank).toBe(1536.5);
  });

  it("writes no activity for a rank-only change", async () => {
    const { actor, boardId, columnId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "a", column_id: columnId });

    await prisma.activities.deleteMany({ where: { board_id: boardId } });

    await client.post(
      `/api/v1/todos/${todo.id}/move`,
      { column_id: columnId, rank: 9999 },
      { token: actor.token },
    );

    expect(await prisma.activities.count({ where: { board_id: boardId } })).toBe(0);
  });

  it("writes a moved activity for a column change, stamped with the actor", async () => {
    const { actor, boardId, columnId } = await setup();
    const columns = await prisma.columns.findMany({
      where: { board_id: boardId },
      select: { id: true },
    });
    const destination = columns.find((c) => c.id !== columnId)!.id;
    const todo = await makeTodo(actor, boardId, { title: "a", column_id: columnId });

    await prisma.activities.deleteMany({ where: { board_id: boardId } });

    await client.post(
      `/api/v1/todos/${todo.id}/move`,
      { column_id: destination, rank: 2048 },
      { token: actor.token },
    );

    const activity = await prisma.activities.findFirstOrThrow({
      where: { board_id: boardId, action: "moved" },
      select: { actor_id: true, entity_id: true },
    });

    expect(activity.actor_id).toBe(actor.id);
    expect(activity.entity_id).toBe(todo.id);
  });

  it("answers 404 for a card on another board", async () => {
    const { actor } = await setup();
    const other = await makeUser("other");
    const theirColumn = await firstColumnOf(other.boardId);
    const theirTodo = await makeTodo(other, other.boardId, {
      title: "Theirs",
      column_id: theirColumn.id,
    });

    const response = await client.post(
      `/api/v1/todos/${theirTodo.id}/move`,
      { column_id: theirColumn.id, rank: 1 },
      { token: actor.token },
    );

    expect(response.status).toBe(404);
  });
});

describe("GET and DELETE /todos/:todoId", () => {
  it("returns the full row, including description and creator_id", async () => {
    const { actor, boardId, columnId } = await setup();
    const todo = await makeTodo(actor, boardId, {
      title: "One",
      column_id: columnId,
      description: "the detail",
    });

    const response = await client.get<Record<string, unknown>>(`/api/v1/todos/${todo.id}`, {
      token: actor.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.description).toBe("the detail");
    expect(response.body.creator_id).toBe(actor.id);
  });

  it("answers 404 for a card on a board the caller cannot see", async () => {
    const { actor } = await setup();
    const other = await makeUser("other");
    const theirColumn = await firstColumnOf(other.boardId);
    const theirTodo = await makeTodo(other, other.boardId, {
      title: "Theirs",
      column_id: theirColumn.id,
    });

    const foreign = await client.get(`/api/v1/todos/${theirTodo.id}`, { token: actor.token });
    const absent = await client.get(`/api/v1/todos/${randomUUID()}`, { token: actor.token });

    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(absent.body));
  });

  it("deletes, and takes the card's subtasks with it", async () => {
    const { actor, boardId, columnId } = await setup();
    const epic = await makeTodo(actor, boardId, { title: "Epic", column_id: columnId, type: "Epic" });

    await makeTodo(actor, boardId, { title: "Child", column_id: columnId, parent_id: epic.id });

    expect(
      (await client.del(`/api/v1/todos/${epic.id}`, undefined, { token: actor.token })).status,
    ).toBe(204);
    expect(await prisma.todos.count({ where: { board_id: boardId } })).toBe(0);
  });

  it("refuses a viewer deleting", async () => {
    const { owner, actor, boardId } = await setup("viewer");
    const columnId = (await firstColumnOf(boardId)).id;
    const todo = await makeTodo(owner, boardId, { title: "One", column_id: columnId });

    expect(
      (await client.del(`/api/v1/todos/${todo.id}`, undefined, { token: actor.token })).status,
    ).toBe(403);
  });
});

// The workflow is enforced in todos.service, so both paths that write column_id
// are exercised here rather than only the unit rule in lib/workflow.
describe("sequential workflow", () => {
  // The four columns every board is provisioned with, one per stage since 0019:
  // To Do, In Progress, In Review, Done.
  async function stages(boardId: string) {
    const columns = await prisma.columns.findMany({
      where: { board_id: boardId },
      orderBy: { rank: "asc" },
      select: { id: true, title: true, category: true },
    });

    const byCategory = (category: string) => {
      const column = columns.find((it) => it.category === category);

      if (!column) throw new Error(`no ${category} column: ${JSON.stringify(columns)}`);

      return column.id;
    };

    return {
      todo: byCategory("todo"),
      inProgress: byCategory("in_progress"),
      inReview: byCategory("in_review"),
      done: byCategory("done"),
    };
  }

  function moveTo(actor: TestUser, todoId: string, columnId: string) {
    return client.post(
      `/api/v1/todos/${todoId}/move`,
      { column_id: columnId, rank: 1024 },
      { token: actor.token },
    );
  }

  function patchTo(actor: TestUser, boardId: string, todoId: string, columnId: string) {
    return client.patch(
      todosUrl(boardId, `/${todoId}`),
      { column_id: columnId },
      { token: actor.token },
    );
  }

  async function columnOf(todoId: string): Promise<string | null> {
    return (await prisma.todos.findUniqueOrThrow({ where: { id: todoId } })).column_id;
  }

  describe("drag and drop (POST /todos/:todoId/move)", () => {
    it("walks the whole chain one step at a time", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.todo });

      for (const next of [column.inProgress, column.inReview, column.done]) {
        expect((await moveTo(actor, todo.id, next)).status).toBe(204);
        expect(await columnOf(todo.id)).toBe(next);
      }
    });

    // The three the product forbids. The first two were impossible to refuse
    // before 0019, because In Review was filed as in_progress.
    it.each([
      ["todo -> in_review", "todo", "inReview", "in_progress"],
      ["in_progress -> done", "inProgress", "done", "in_review"],
      ["todo -> done", "todo", "done", "in_progress"],
    ])("REFUSES %s, naming what it skipped", async (_label, from, to, skipped) => {
      const { actor, boardId } = await setup();
      const column = (await stages(boardId)) as Record<string, string>;
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column[from] });

      const response = await client.post<{ error: { code: string; message: string } }>(
        `/api/v1/todos/${todo.id}/move`,
        { column_id: column[to], rank: 1024 },
        { token: actor.token },
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("bad_request");
      expect(response.body.error.message).toContain(skipped);
      expect(await columnOf(todo.id)).toBe(column[from]);
    });
  });

  describe("status update (PATCH /boards/:boardId/todos/:todoId)", () => {
    it("walks the whole chain one step at a time", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.todo });

      for (const next of [column.inProgress, column.inReview, column.done]) {
        expect((await patchTo(actor, boardId, todo.id, next)).status).toBe(200);
      }
    });

    // The same rule through the other door: PATCH must not be the way round it.
    it.each([
      ["todo -> in_review", "todo", "inReview"],
      ["in_progress -> done", "inProgress", "done"],
      ["todo -> done", "todo", "done"],
    ])("REFUSES %s", async (_label, from, to) => {
      const { actor, boardId } = await setup();
      const column = (await stages(boardId)) as Record<string, string>;
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column[from] });

      expect((await patchTo(actor, boardId, todo.id, column[to])).status).toBe(400);
      expect(await columnOf(todo.id)).toBe(column[from]);
    });
  });

  // The flag moved from the space to the board in 0020; turning it off must
  // reach the transition API, not merely the settings row.
  describe("boards.workflow_enabled = false", () => {
    function setWorkflow(actor: TestUser, boardId: string, enabled: boolean) {
      return client.patch(
        `/api/v1/boards/${boardId}`,
        { workflow_enabled: enabled },
        { token: actor.token },
      );
    }

    it("allows todo -> done through move", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.todo });

      expect((await setWorkflow(actor, boardId, false)).status).toBe(200);

      expect((await moveTo(actor, todo.id, column.done)).status).toBe(204);
      expect(await columnOf(todo.id)).toBe(column.done);
    });

    it("allows todo -> done through patch", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.todo });

      await setWorkflow(actor, boardId, false);

      expect((await patchTo(actor, boardId, todo.id, column.done)).status).toBe(200);
    });

    // The switch is the only thing that changed, so flipping it back has to
    // restore the refusal on the very same card.
    it("refuses again once it is switched back on", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.todo });

      await setWorkflow(actor, boardId, false);
      expect((await moveTo(actor, todo.id, column.done)).status).toBe(204);
      expect((await moveTo(actor, todo.id, column.todo)).status).toBe(204);

      await setWorkflow(actor, boardId, true);

      expect((await moveTo(actor, todo.id, column.done)).status).toBe(400);
    });

    it("is per board: turning it off on one leaves the other enforcing", async () => {
      const mine = await setup();
      const theirs = await setup();
      const myColumns = await stages(mine.boardId);
      const theirColumns = await stages(theirs.boardId);

      await setWorkflow(mine.actor, mine.boardId, false);

      const myTodo = await makeTodo(mine.actor, mine.boardId, {
        title: "A",
        column_id: myColumns.todo,
      });
      const theirTodo = await makeTodo(theirs.actor, theirs.boardId, {
        title: "B",
        column_id: theirColumns.todo,
      });

      expect((await moveTo(mine.actor, myTodo.id, myColumns.done)).status).toBe(204);
      expect((await moveTo(theirs.actor, theirTodo.id, theirColumns.done)).status).toBe(400);
    });

    it("REFUSES a viewer changing it, and an editor too", async () => {
      const viewer = await setup("viewer");
      const editor = await setup("editor");

      expect((await setWorkflow(viewer.actor, viewer.boardId, false)).status).toBe(403);
      expect((await setWorkflow(editor.actor, editor.boardId, false)).status).toBe(403);

      expect(
        (await prisma.boards.findUniqueOrThrow({ where: { id: viewer.boardId } }))
          .workflow_enabled,
      ).toBe(true);
    });
  });

  // A board is only held to the stages it has. Refusing in_progress -> done on
  // a board with no In Review column would leave work unable to reach Done at
  // all, since there is nowhere to pass through.
  describe("a stage the board does not have", () => {
    it("allows in_progress -> done once the In Review column is gone", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, {
        title: "A",
        column_id: column.inProgress,
      });

      expect((await moveTo(actor, todo.id, column.done)).status).toBe(400);

      const removed = await client.del(
        `/api/v1/columns/${column.inReview}`,
        { moveToColumnId: column.done },
        { token: actor.token },
      );

      expect(removed.status).toBe(204);

      expect((await moveTo(actor, todo.id, column.done)).status).toBe(204);
    });

    it("still refuses todo -> done, because In Progress is still there", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.todo });

      await client.del(
        `/api/v1/columns/${column.inReview}`,
        { moveToColumnId: column.done },
        { token: actor.token },
      );

      const response = await client.post<{ error: { message: string } }>(
        `/api/v1/todos/${todo.id}/move`,
        { column_id: column.done, rank: 1024 },
        { token: actor.token },
      );

      expect(response.status).toBe(400);
      // Names only the stage that is actually reachable.
      expect(response.body.error.message).toContain("in_progress");
      expect(response.body.error.message).not.toContain("in_review");
    });
  });

  describe("transitions outside the workflow keep working", () => {
    it("a first placement is not a transition: create straight into Done", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);

      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.done });

      expect(todo.column_id).toBe(column.done);
    });

    it("a backlog card arriving on the board may land anywhere", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: null });

      expect((await moveTo(actor, todo.id, column.done)).status).toBe(204);
    });

    // A board may still have two columns sharing a category; that is a sideways
    // move, not a transition.
    it("sideways between two columns of one category is allowed", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const second = await client.post<{ id: string }>(
        `/api/v1/boards/${boardId}/columns`,
        { title: "Building", category: "in_progress" },
        { token: actor.token },
      );

      expect(second.status).toBe(201);

      const todo = await makeTodo(actor, boardId, {
        title: "A",
        column_id: column.inProgress,
      });

      expect((await moveTo(actor, todo.id, second.body.id)).status).toBe(204);
    });

    it("going backwards is allowed, including done -> todo", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.done });

      expect((await moveTo(actor, todo.id, column.inReview)).status).toBe(204);
      expect((await moveTo(actor, todo.id, column.todo)).status).toBe(204);
    });

    it("reordering within a column is not a transition", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.todo });

      expect((await moveTo(actor, todo.id, column.todo)).status).toBe(204);
    });

    it("a patch that does not name a column is untouched", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.todo });

      const response = await client.patch(
        todosUrl(boardId, `/${todo.id}`),
        { title: "Renamed" },
        { token: actor.token },
      );

      expect(response.status).toBe(200);
    });

    // Deleting a column has to move its cards somewhere whatever their
    // category, or a To Do column could not be deleted into a Done one.
    it("deleting a column rehomes its cards across stages", async () => {
      const { actor, boardId } = await setup();
      const column = await stages(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", column_id: column.todo });

      const response = await client.del(
        `/api/v1/columns/${column.todo}`,
        { moveToColumnId: column.done },
        { token: actor.token },
      );

      expect(response.status).toBe(204);
      expect(await columnOf(todo.id)).toBe(column.done);
    });
  });
});
