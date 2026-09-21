import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;
let admin: TestUser;
let boardId: string;

async function makeSuperadmin(name: string): Promise<TestUser> {
  const user = await makeUser(name);

  await prisma.users.update({ where: { id: user.id }, data: { org_role: "superadmin" } });

  return user;
}

async function columnOf(category: string): Promise<string> {
  const row = await prisma.columns.findFirstOrThrow({
    where: { board_id: boardId, category },
    select: { id: true },
  });

  return row.id;
}

async function card(category: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();

  const response = await client.patch(
    `/api/v1/boards/${boardId}/todos/${id}`,
    { title: "Cache board membership", column_id: await columnOf(category), rank: 1, ...extra },
    { token: admin.token },
  );

  expect(response.status).toBeLessThan(300);

  return id;
}

function patch(id: string, body: Record<string, unknown>) {
  return client.patch(`/api/v1/boards/${boardId}/todos/${id}`, body, { token: admin.token });
}

interface TodoBody {
  todo: {
    id: string;
    board_id: string;
    board_title: string | null;
    key_prefix: string;
    board_key: number | null;
    space_title: string | null;
    title: string | null;
    type: string;
    priority: string | null;
    estimate: number | null;
    column_title: string | null;
    category: string | null;
    assignee_username: string | null;
    completed_by_username: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    cycle_days: number | null;
    lead_days: number | null;
  };
  activity: { id: string; action: string; created_at: string; key_prefix: string }[];
}

function fetchTodo(id: string, token = admin.token) {
  return client.get<TodoBody>(`/api/v1/admin/todos/${id}`, { token });
}

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();
  admin = await makeSuperadmin("root");
  boardId = admin.boardId;
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("GET /admin/todos/:id — the gate", () => {
  it("answers 401 with no token", async () => {
    const id = await card("todo");

    expect((await client.get(`/api/v1/admin/todos/${id}`)).status).toBe(401);
  });

  // 404 and NOT 403, which is the rule every /admin route follows: a 403
  // confirms the admin surface exists to anyone who probes for it.
  // admin.matrix.int.test.ts enforces this across the whole router.
  it("answers 404 to a signed-in non-superadmin", async () => {
    const id = await card("todo");
    const outsider = await makeUser("outsider");

    expect((await fetchTodo(id, outsider.token)).status).toBe(404);
  });

  it("answers 404 for a task that does not exist", async () => {
    expect((await fetchTodo(randomUUID())).status).toBe(404);
  });

  it("answers 200 to a superadmin", async () => {
    expect((await fetchTodo(await card("todo"))).status).toBe(200);
  });
});

describe("the task metadata", () => {
  it("carries the identity, board and space a drill-down needs", async () => {
    const id = await card("todo", { priority: "high", estimate: 5, assignee_id: admin.id });
    const { body } = await fetchTodo(id);

    expect(body.todo.id).toBe(id);
    expect(body.todo.title).toBe("Cache board membership");
    expect(body.todo.board_id).toBe(boardId);
    expect(body.todo.board_title).not.toBeNull();
    expect(body.todo.space_title).not.toBeNull();
    expect(body.todo.priority).toBe("high");
    expect(body.todo.estimate).toBe(5);
    expect(body.todo.assignee_username).toBe(admin.username);
    expect(body.todo.column_title).toBe("To Do");
    expect(body.todo.category).toBe("todo");
  });

  it("returns numbers, not strings, for the numeric fields", async () => {
    const id = await card("todo", { estimate: 8 });
    const { body } = await fetchTodo(id);

    expect(typeof body.todo.estimate).toBe("number");
    expect(typeof body.todo.board_key).toBe("number");
  });

  it("reports the timestamps the triggers maintain, and the durations they imply", async () => {
    const id = await card("done", { assignee_id: admin.id });

    await prisma.todos.update({
      where: { id },
      data: {
        created_at: new Date(Date.now() - 10 * 86_400_000),
        started_at: new Date(Date.now() - 8 * 86_400_000),
        completed_at: new Date(Date.now() - 6 * 86_400_000),
      },
    });

    const { body } = await fetchTodo(id);

    expect(body.todo.started_at).not.toBeNull();
    expect(body.todo.completed_at).not.toBeNull();
    expect(body.todo.completed_by_username).toBe(admin.username);
    expect(body.todo.cycle_days).toBeCloseTo(2, 3);
    expect(body.todo.lead_days).toBeCloseTo(4, 3);
  });

  it("leaves the durations unmeasured while the work is open", async () => {
    const { body } = await fetchTodo(await card("todo"));

    expect(body.todo.completed_at).toBeNull();
    expect(body.todo.cycle_days).toBeNull();
    expect(body.todo.lead_days).toBeNull();
  });

  // KAN is only the DEFAULT. AdminActivityPage hardcoded it, which renders the
  // wrong key on any board whose prefix was changed.
  it("uses the board's own key prefix rather than assuming KAN", async () => {
    await prisma.boards.update({ where: { id: boardId }, data: { key_prefix: "OPS" } });

    const { body } = await fetchTodo(await card("todo"));

    expect(body.todo.key_prefix).toBe("OPS");
  });
});

describe("the task's activity", () => {
  it("returns that task's rows, newest first", async () => {
    const id = await card("todo");

    await patch(id, { title: "renamed once" });
    await patch(id, { priority: "low" });

    const { body } = await fetchTodo(id);

    expect(body.activity.length).toBeGreaterThanOrEqual(3);
    expect(body.activity.map((row) => row.action)).toContain("retitled");
    expect(body.activity.map((row) => row.action)).toContain("priority_changed");

    const stamps = body.activity.map((row) => Date.parse(row.created_at));

    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
  });

  it("is capped at twenty rows", async () => {
    const id = await card("todo");

    for (let i = 0; i < 25; i += 1) await patch(id, { title: `rename ${i}` });

    expect((await fetchTodo(id)).body.activity).toHaveLength(20);
  });

  it("carries only this task's activity, not the board's", async () => {
    const mine = await card("todo");
    const other = await card("todo");

    await patch(other, { title: "somebody else" });

    const { body } = await fetchTodo(mine);

    expect(body.activity.every((row) => row.action === "created")).toBe(true);
  });

  it("carries the key prefix on every activity row too", async () => {
    await prisma.boards.update({ where: { id: boardId }, data: { key_prefix: "OPS" } });

    const { body } = await fetchTodo(await card("todo"));

    expect(body.activity.every((row) => row.key_prefix === "OPS")).toBe(true);
  });
});
