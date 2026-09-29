import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import {
  addMember,
  firstStatusOf,
  makeUser,
  stageStatuses,
  workflowDraft,
  type TestUser,
} from "../../testing/fixtures.js";
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
  status_id: string | null;
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
  "status_id",
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
  const status = await firstStatusOf(owner.boardId);

  if (role === "owner") return { owner, actor: owner, boardId: owner.boardId, statusId: status.id };

  const member = await makeUser(role);

  await addMember(owner.boardId, member, role, owner.id);

  return { owner, actor: member, boardId: owner.boardId, statusId: status.id };
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
    const { actor, boardId, statusId } = await setup();

    await makeTodo(actor, boardId, { title: "One", status_id: statusId });

    const response = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body[0]!).sort()).toEqual([...TODO_FIELDS].sort());
  });

  // description is the only field the detail route adds now: creator_id joined
  // the list projection for the predefined filters ("Reported by me"), which
  // cannot ask their question without it.
  it("omits description, which only the detail route returns", async () => {
    const { actor, boardId, statusId } = await setup();

    await makeTodo(actor, boardId, { title: "One", status_id: statusId, description: "secret" });

    const listed = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });

    expect(listed.body[0]).not.toHaveProperty("description");
    expect(listed.body[0]).toHaveProperty("creator_id", actor.id);
  });

  // position is int8 and estimate is numeric: JSON.stringify throws on the
  // first and turns the second into a string.
  it("serialises position and estimate as JSON numbers", async () => {
    const { actor, boardId, statusId } = await setup();

    await makeTodo(actor, boardId, { title: "One", status_id: statusId, estimate: 5 });

    const listed = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });

    expect(typeof listed.body[0]!.position).toBe("number");
    expect(listed.body[0]!.estimate).toBe(5);
    expect(typeof listed.body[0]!.estimate).toBe("number");
  });

  it("keeps null and 0 estimates distinct", async () => {
    const { actor, boardId, statusId } = await setup();

    await makeTodo(actor, boardId, { title: "zero", status_id: statusId, estimate: 0 });
    await makeTodo(actor, boardId, { title: "none", status_id: statusId });

    const listed = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });
    const byTitle = new Map(listed.body.map((t) => [t.title, t.estimate]));

    expect(byTitle.get("zero")).toBe(0);
    expect(byTitle.get("none")).toBeNull();
  });

  it("returns one flat array including subtasks", async () => {
    const { actor, boardId, statusId } = await setup();
    const epic = await makeTodo(actor, boardId, { title: "Epic", status_id: statusId, type: "Epic" });

    await makeTodo(actor, boardId, { title: "Task", status_id: statusId, parent_id: epic.id });

    const listed = await client.get<Todo[]>(todosUrl(boardId), { token: actor.token });

    expect(listed.body).toHaveLength(2);
  });

  it("orders by rank, ascending, nulls last", async () => {
    const { actor, boardId, statusId } = await setup();

    for (const title of ["a", "b", "c"]) {
      await makeTodo(actor, boardId, { title, status_id: statusId });
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
    const { actor, boardId, statusId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "One", status_id: statusId });

    expect(todo.board_key).toBe(1);
  });

  it("never reuses a key after a delete", async () => {
    const { actor, boardId, statusId } = await setup();
    const first = await makeTodo(actor, boardId, { title: "One", status_id: statusId });

    await client.del(`/api/v1/todos/${first.id}`, undefined, { token: actor.token });

    const second = await makeTodo(actor, boardId, { title: "Two", status_id: statusId });

    expect(second.board_key).toBe(2);
  });

  it("appends after the column's last card", async () => {
    const { actor, boardId, statusId } = await setup();
    const first = await makeTodo(actor, boardId, { title: "One", status_id: statusId });
    const second = await makeTodo(actor, boardId, { title: "Two", status_id: statusId });

    expect(second.rank!).toBeGreaterThan(first.rank!);
  });

  it("sets creator_id from the actor, never the body", async () => {
    const { actor, boardId, statusId } = await setup();
    const stranger = await makeUser("stranger");

    const todo = await makeTodo(actor, boardId, {
      title: "One",
      status_id: statusId,
      creator_id: stranger.id,
    });

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { creator_id: true },
    });

    expect(row.creator_id).toBe(actor.id);
  });

  it("IGNORES board_id and board_key in the body", async () => {
    const { actor, boardId, statusId } = await setup();
    const other = await makeUser("other");

    const todo = await makeTodo(actor, boardId, {
      title: "One",
      status_id: statusId,
      board_id: other.boardId,
      board_key: 999,
    });

    expect(todo.board_id).toBe(boardId);
    expect(todo.board_key).toBe(1);
  });

  it("honours a client-minted id", async () => {
    const { actor, boardId, statusId } = await setup();
    const id = randomUUID();
    const todo = await makeTodo(actor, boardId, { id, title: "Minted", status_id: statusId });

    expect(todo.id).toBe(id);
  });

  it("refuses a viewer with 403", async () => {
    const { actor, boardId, statusId } = await setup("viewer");

    expect(
      (await client.post(todosUrl(boardId), { title: "x", status_id: statusId }, { token: actor.token }))
        .status,
    ).toBe(403);
  });

  it("lets an editor create", async () => {
    const { actor, boardId, statusId } = await setup("editor");

    expect(
      (await client.post(todosUrl(boardId), { title: "x", status_id: statusId }, { token: actor.token }))
        .status,
    ).toBe(201);
  });

  it("rejects a type and a priority outside the CHECKs", async () => {
    const { actor, boardId, statusId } = await setup();

    for (const body of [
      { title: "x", status_id: statusId, type: "Subtask" },
      { title: "x", status_id: statusId, priority: "urgent" },
    ]) {
      expect((await client.post(todosUrl(boardId), body, { token: actor.token })).status).toBe(400);
    }
  });

  it("rejects a negative estimate", async () => {
    const { actor, boardId, statusId } = await setup();

    expect(
      (
        await client.post(
          todosUrl(boardId),
          { title: "x", status_id: statusId, estimate: -1 },
          { token: actor.token },
        )
      ).status,
    ).toBe(400);
  });

  it("reports a date range violation as a 400, not a 500", async () => {
    const { actor, boardId, statusId } = await setup();

    const response = await client.post(
      todosUrl(boardId),
      {
        title: "x",
        status_id: statusId,
        start_date: "2026-06-02T00:00:00Z",
        due_date: "2026-06-01T00:00:00Z",
      },
      { token: actor.token },
    );

    expect(response.status).toBe(400);
  });

  it("cannot place a card in a status belonging to another board", async () => {
    const { actor, boardId } = await setup();
    const other = await makeUser("other");
    const theirStatus = await firstStatusOf(other.boardId);

    const response = await client.post(
      todosUrl(boardId),
      { title: "x", status_id: theirStatus.id },
      { token: actor.token },
    );

    expect(response.status).toBe(400);
    expect(await prisma.todos.count({ where: { status_id: theirStatus.id } })).toBe(0);
  });
});

describe("the work-item hierarchy", () => {
  it("reports every violation as a clean 400, never a 500", async () => {
    const { actor, boardId, statusId } = await setup();

    const epic = await makeTodo(actor, boardId, {
      title: "Epic",
      status_id: statusId,
      type: "Epic",
    });
    const task = await makeTodo(actor, boardId, {
      title: "Task",
      status_id: statusId,
      parent_id: epic.id,
    });
    const subtask = await makeTodo(actor, boardId, {
      title: "Sub",
      status_id: statusId,
      parent_id: task.id,
    });

    const violations: [string, Record<string, unknown>][] = [
      ["an Epic with a parent", { title: "x", status_id: statusId, type: "Epic", parent_id: epic.id }],
      ["a subtask under a subtask", { title: "x", status_id: statusId, parent_id: subtask.id }],
      ["a parent from another board", { title: "x", status_id: statusId, parent_id: randomUUID() }],
      [
        "a subtask carrying its own sprint",
        { title: "x", status_id: statusId, parent_id: task.id, sprint_id: randomUUID() },
      ],
    ];

    for (const [label, body] of violations) {
      const response = await client.post(todosUrl(boardId), body, { token: actor.token });

      expect(response.status, label).toBeGreaterThanOrEqual(400);
      expect(response.status, label).toBeLessThan(500);
    }
  });

  it("refuses a cross-board parent", async () => {
    const { actor, boardId, statusId } = await setup();
    const other = await makeUser("other");
    const theirStatus = await firstStatusOf(other.boardId);
    const theirTodo = await makeTodo(other, other.boardId, {
      title: "Theirs",
      status_id: theirStatus.id,
    });

    const response = await client.post(
      todosUrl(boardId),
      { title: "x", status_id: statusId, parent_id: theirTodo.id },
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
    const { actor, boardId, statusId } = await setup();
    const id = randomUUID();

    const response = await client.patch<Todo>(
      todosUrl(boardId, `/${id}`),
      { title: "Made by PATCH", status_id: statusId },
      { token: actor.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
    expect(await prisma.todos.count({ where: { id } })).toBe(1);
  });

  it("updates an existing row rather than duplicating it", async () => {
    const { actor, boardId, statusId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "Before", status_id: statusId });

    const response = await client.patch<Todo>(
      todosUrl(boardId, `/${todo.id}`),
      { title: "After" },
      { token: actor.token },
    );

    expect(response.body.title).toBe("After");
    expect(await prisma.todos.count({ where: { board_id: boardId } })).toBe(1);
  });

  it("keeps the board_key it was given rather than allocating a second", async () => {
    const { actor, boardId, statusId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "One", status_id: statusId });

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
    const theirStatus = await firstStatusOf(other.boardId);
    const theirTodo = await makeTodo(other, other.boardId, {
      title: "Theirs",
      status_id: theirStatus.id,
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
    const { actor, boardId, statusId } = await setup();
    const statuses = await prisma.statuses.findMany({
      where: { board_id: boardId },
      select: { id: true },
    });
    const destination = statuses.find((s) => s.id !== statusId)!.id;

    const a = await makeTodo(actor, boardId, { title: "a", status_id: statusId });
    const b = await makeTodo(actor, boardId, { title: "b", status_id: statusId });

    const before = await prisma.todos.findUniqueOrThrow({
      where: { id: b.id },
      select: { rank: true, status_id: true },
    });

    const response = await client.post(
      `/api/v1/todos/${a.id}/move`,
      { status_id: destination, rank: 4096 },
      { token: actor.token },
    );

    expect(response.status).toBe(204);

    const moved = await prisma.todos.findUniqueOrThrow({
      where: { id: a.id },
      select: { rank: true, status_id: true },
    });
    const untouched = await prisma.todos.findUniqueOrThrow({
      where: { id: b.id },
      select: { rank: true, status_id: true },
    });

    expect(moved.status_id).toBe(destination);
    expect(moved.rank).toBe(4096);
    expect(untouched).toEqual(before);
  });

  it("takes the client's rank rather than recomputing one", async () => {
    const { actor, boardId, statusId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "a", status_id: statusId });

    await client.post(
      `/api/v1/todos/${todo.id}/move`,
      { status_id: statusId, rank: 1536.5 },
      { token: actor.token },
    );

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { rank: true },
    });

    expect(row.rank).toBe(1536.5);
  });

  it("writes no activity for a rank-only change", async () => {
    const { actor, boardId, statusId } = await setup();
    const todo = await makeTodo(actor, boardId, { title: "a", status_id: statusId });

    await prisma.activities.deleteMany({ where: { board_id: boardId } });

    await client.post(
      `/api/v1/todos/${todo.id}/move`,
      { status_id: statusId, rank: 9999 },
      { token: actor.token },
    );

    expect(await prisma.activities.count({ where: { board_id: boardId } })).toBe(0);
  });

  it("writes a moved activity for a status change, stamped with the actor", async () => {
    const { actor, boardId, statusId } = await setup();
    const { inProgress: destination } = await stageStatuses(boardId);
    const todo = await makeTodo(actor, boardId, { title: "a", status_id: statusId });

    await prisma.activities.deleteMany({ where: { board_id: boardId } });

    await client.post(
      `/api/v1/todos/${todo.id}/move`,
      { status_id: destination, rank: 2048 },
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
    const theirStatus = await firstStatusOf(other.boardId);
    const theirTodo = await makeTodo(other, other.boardId, {
      title: "Theirs",
      status_id: theirStatus.id,
    });

    const response = await client.post(
      `/api/v1/todos/${theirTodo.id}/move`,
      { status_id: theirStatus.id, rank: 1 },
      { token: actor.token },
    );

    expect(response.status).toBe(404);
  });
});

describe("GET and DELETE /todos/:todoId", () => {
  it("returns the full row, including description and creator_id", async () => {
    const { actor, boardId, statusId } = await setup();
    const todo = await makeTodo(actor, boardId, {
      title: "One",
      status_id: statusId,
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
    const theirStatus = await firstStatusOf(other.boardId);
    const theirTodo = await makeTodo(other, other.boardId, {
      title: "Theirs",
      status_id: theirStatus.id,
    });

    const foreign = await client.get(`/api/v1/todos/${theirTodo.id}`, { token: actor.token });
    const absent = await client.get(`/api/v1/todos/${randomUUID()}`, { token: actor.token });

    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(absent.body));
  });

  it("deletes, and takes the card's subtasks with it", async () => {
    const { actor, boardId, statusId } = await setup();
    const epic = await makeTodo(actor, boardId, { title: "Epic", status_id: statusId, type: "Epic" });

    await makeTodo(actor, boardId, { title: "Child", status_id: statusId, parent_id: epic.id });

    expect(
      (await client.del(`/api/v1/todos/${epic.id}`, undefined, { token: actor.token })).status,
    ).toBe(204);
    expect(await prisma.todos.count({ where: { board_id: boardId } })).toBe(0);
  });

  it("refuses a viewer deleting", async () => {
    const { owner, actor, boardId } = await setup("viewer");
    const statusId = (await firstStatusOf(boardId)).id;
    const todo = await makeTodo(owner, boardId, { title: "One", status_id: statusId });

    expect(
      (await client.del(`/api/v1/todos/${todo.id}`, undefined, { token: actor.token })).status,
    ).toBe(403);
  });
});

// The workflow is enforced in todos.service, so both paths that write status_id
// are exercised here rather than only the unit rule in lib/workflow.
describe("sequential workflow", () => {
  function moveTo(actor: TestUser, todoId: string, statusId: string) {
    return client.post(
      `/api/v1/todos/${todoId}/move`,
      { status_id: statusId, rank: 1024 },
      { token: actor.token },
    );
  }

  function patchTo(actor: TestUser, boardId: string, todoId: string, statusId: string) {
    return client.patch(
      todosUrl(boardId, `/${todoId}`),
      { status_id: statusId },
      { token: actor.token },
    );
  }

  function publish(actor: TestUser, boardId: string, body: unknown) {
    return client.put(`/api/v1/boards/${boardId}/workflow`, body, { token: actor.token });
  }

  async function statusOf(todoId: string): Promise<string | null> {
    return (await prisma.todos.findUniqueOrThrow({ where: { id: todoId } })).status_id;
  }

  describe("drag and drop (POST /todos/:todoId/move)", () => {
    it("walks the whole chain one step at a time", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });

      for (const next of [status.inProgress, status.inReview, status.done]) {
        expect((await moveTo(actor, todo.id, next)).status).toBe(204);
        expect(await statusOf(todo.id)).toBe(next);
      }
    });

    // The three the product forbids. The first two were impossible to refuse
    // before 0019, because In Review was filed as in_progress.
    it.each([
      ["todo -> in_review", "todo", "inReview", "In Review"],
      ["in_progress -> done", "inProgress", "done", "Done"],
      ["todo -> done", "todo", "done", "Done"],
    ])("REFUSES %s, naming the missing transition", async (_label, from, to, target) => {
      const { actor, boardId } = await setup();
      const status = (await stageStatuses(boardId)) as Record<string, string>;
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status[from] });

      const response = await client.post<{ error: { code: string; message: string } }>(
        `/api/v1/todos/${todo.id}/move`,
        { status_id: status[to], rank: 1024 },
        { token: actor.token },
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("bad_request");
      expect(response.body.error.message).toContain("no transition");
      expect(response.body.error.message).toContain(`"${target}"`);
      expect(await statusOf(todo.id)).toBe(status[from]);
    });
  });

  describe("status update (PATCH /boards/:boardId/todos/:todoId)", () => {
    it("walks the whole chain one step at a time", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });

      for (const next of [status.inProgress, status.inReview, status.done]) {
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
      const status = (await stageStatuses(boardId)) as Record<string, string>;
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status[from] });

      expect((await patchTo(actor, boardId, todo.id, status[to]!)).status).toBe(400);
      expect(await statusOf(todo.id)).toBe(status[from]);
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
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });

      expect((await setWorkflow(actor, boardId, false)).status).toBe(200);

      expect((await moveTo(actor, todo.id, status.done)).status).toBe(204);
      expect(await statusOf(todo.id)).toBe(status.done);
    });

    it("allows todo -> done through patch", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });

      await setWorkflow(actor, boardId, false);

      expect((await patchTo(actor, boardId, todo.id, status.done)).status).toBe(200);
    });

    // The switch is the only thing that changed, so flipping it back has to
    // restore the refusal on the very same card.
    it("refuses again once it is switched back on", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });

      await setWorkflow(actor, boardId, false);
      expect((await moveTo(actor, todo.id, status.done)).status).toBe(204);
      expect((await moveTo(actor, todo.id, status.todo)).status).toBe(204);

      await setWorkflow(actor, boardId, true);

      expect((await moveTo(actor, todo.id, status.done)).status).toBe(400);
    });

    it("is per board: turning it off on one leaves the other enforcing", async () => {
      const mine = await setup();
      const theirs = await setup();
      const myStatuses = await stageStatuses(mine.boardId);
      const theirStatuses = await stageStatuses(theirs.boardId);

      await setWorkflow(mine.actor, mine.boardId, false);

      const myTodo = await makeTodo(mine.actor, mine.boardId, {
        title: "A",
        status_id: myStatuses.todo,
      });
      const theirTodo = await makeTodo(theirs.actor, theirs.boardId, {
        title: "B",
        status_id: theirStatuses.todo,
      });

      expect((await moveTo(mine.actor, myTodo.id, myStatuses.done)).status).toBe(204);
      expect((await moveTo(theirs.actor, theirTodo.id, theirStatuses.done)).status).toBe(400);
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

  // The rule is the board's stored edges: adding one allows the move, removing
  // one refuses it, and nothing is inferred from categories.
  describe("editing the transitions", () => {
    it("allows in_progress -> done once that edge is published", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, {
        title: "A",
        status_id: status.inProgress,
      });

      expect((await moveTo(actor, todo.id, status.done)).status).toBe(400);

      const draft = await workflowDraft(boardId);

      const published = await publish(actor, boardId, {
        ...draft,
        transitions: [...draft.transitions, { from: status.inProgress, to: status.done }],
      });

      expect(published.status).toBe(200);
      expect((await moveTo(actor, todo.id, status.done)).status).toBe(204);
    });

    it("refuses a move whose edge was removed, and only that direction", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });
      const draft = await workflowDraft(boardId);

      const published = await publish(actor, boardId, {
        ...draft,
        transitions: draft.transitions.filter(
          (edge) => !(edge.from === status.todo && edge.to === status.inProgress),
        ),
      });

      expect(published.status).toBe(200);
      expect((await moveTo(actor, todo.id, status.inProgress)).status).toBe(400);
      expect(await statusOf(todo.id)).toBe(status.todo);
    });

    it("a move to an unmapped status is refused, however the edges read", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });
      const draft = await workflowDraft(boardId);
      const parked = randomUUID();

      const published = await publish(actor, boardId, {
        ...draft,
        statuses: [
          ...draft.statuses,
          { id: parked, column_id: null, name: "Parked", category: "in_progress", is_hidden: false },
        ],
        transitions: [...draft.transitions, { from: status.todo, to: parked }],
      });

      expect(published.status).toBe(200);
      expect((await moveTo(actor, todo.id, parked)).status).toBe(400);
    });
  });

  describe("transitions outside the workflow keep working", () => {
    it("a first placement is not a transition: create straight into Done", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);

      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.done });

      expect(todo.status_id).toBe(status.done);
    });

    it("a backlog card arriving on the board may land anywhere", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: null });

      expect((await moveTo(actor, todo.id, status.done)).status).toBe(204);
    });

    it("a new status is reachable once its edge is published", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const draft = await workflowDraft(boardId);
      const column = randomUUID();
      const building = randomUUID();

      const published = await publish(actor, boardId, {
        ...draft,
        columns: [...draft.columns, { id: column, title: "Building" }],
        statuses: [
          ...draft.statuses,
          { id: building, column_id: column, name: "Building", category: "in_progress", is_hidden: false },
        ],
        transitions: [...draft.transitions, { from: status.inProgress, to: building }],
      });

      expect(published.status).toBe(200);

      const todo = await makeTodo(actor, boardId, {
        title: "A",
        status_id: status.inProgress,
      });

      expect((await moveTo(actor, todo.id, building)).status).toBe(204);
    });

    it("going backwards is allowed, including done -> todo", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.done });

      expect((await moveTo(actor, todo.id, status.inReview)).status).toBe(204);
      expect((await moveTo(actor, todo.id, status.todo)).status).toBe(204);
    });

    it("reordering within a status is not a transition", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });

      expect((await moveTo(actor, todo.id, status.todo)).status).toBe(204);
    });

    it("a patch that does not name a status is untouched", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });

      const response = await client.patch(
        todosUrl(boardId, `/${todo.id}`),
        { title: "Renamed" },
        { token: actor.token },
      );

      expect(response.status).toBe(200);
    });

    // Deleting a status has to move its cards somewhere whatever their
    // category, or a To Do status could not be deleted into a Done one.
    it("deleting a status migrates its cards across stages", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });
      const draft = await workflowDraft(boardId);
      const column = draft.statuses.find((it) => it.id === status.todo)!.column_id;

      const response = await publish(actor, boardId, {
        ...draft,
        columns: draft.columns.filter((it) => it.id !== column),
        statuses: draft.statuses.filter((it) => it.id !== status.todo),
        migrations: [{ from: status.todo, to: status.done }],
      });

      expect(response.status).toBe(200);
      expect(await statusOf(todo.id)).toBe(status.done);
    });
  });

  // Hidden statuses are retired from NEW placement only (Phase B).
  describe("a hidden status", () => {
    async function hide(actor: TestUser, boardId: string, statusId: string) {
      const draft = await workflowDraft(boardId);

      const response = await publish(actor, boardId, {
        ...draft,
        statuses: draft.statuses.map((it) => (it.id === statusId ? { ...it, is_hidden: true } : it)),
      });

      expect(response.status).toBe(200);
    }

    it("refuses a new card created into it", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);

      await hide(actor, boardId, status.inProgress);

      const response = await client.post(
        todosUrl(boardId),
        { title: "A", status_id: status.inProgress },
        { token: actor.token },
      );

      expect(response.status).toBe(400);
    });

    it("refuses a card moved into it, through move and through patch", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.todo });

      await hide(actor, boardId, status.inProgress);

      expect((await moveTo(actor, todo.id, status.inProgress)).status).toBe(400);
      expect((await patchTo(actor, boardId, todo.id, status.inProgress)).status).toBe(400);
      expect(await statusOf(todo.id)).toBe(status.todo);
    });

    it("leaves a card already in it valid: it still reads, reorders and moves out", async () => {
      const { actor, boardId } = await setup();
      const status = await stageStatuses(boardId);
      const todo = await makeTodo(actor, boardId, { title: "A", status_id: status.inProgress });

      await hide(actor, boardId, status.inProgress);

      expect((await client.get(`/api/v1/todos/${todo.id}`, { token: actor.token })).status).toBe(200);
      expect((await moveTo(actor, todo.id, status.inProgress)).status).toBe(204);
      expect((await patchTo(actor, boardId, todo.id, status.inProgress)).status).toBe(200);
      expect((await moveTo(actor, todo.id, status.todo)).status).toBe(204);
    });
  });
});
