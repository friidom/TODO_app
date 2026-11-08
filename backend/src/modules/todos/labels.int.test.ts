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

interface Todo {
  id: string;
  labels: string[];
}

async function makeTodo(actor: TestUser, boardId: string): Promise<Todo> {
  const response = await client.post<Todo>(
    `/api/v1/boards/${boardId}/todos`,
    { title: "Card" },
    { token: actor.token },
  );

  return response.body;
}

const add = (actor: TestUser, todoId: string, name: string) =>
  client.post<Todo & { error?: { message: string } }>(
    `/api/v1/todos/${todoId}/labels`,
    { name },
    { token: actor.token },
  );

const remove = (actor: TestUser, todoId: string, name: string) =>
  client.del<Todo>(
    `/api/v1/todos/${todoId}/labels?name=${encodeURIComponent(name)}`,
    undefined,
    {
      token: actor.token,
    },
  );

describe("labels", () => {
  it("adds a trimmed label and returns it on the board's list", async () => {
    const owner = await makeUser("owner");
    const todo = await makeTodo(owner, owner.boardId);

    const response = await add(owner, todo.id, "  needs   review ");

    expect(response.status).toBe(200);
    expect(response.body.labels).toEqual(["needs review"]);

    const list = await client.get<Todo[]>(
      `/api/v1/boards/${owner.boardId}/todos`,
      {
        token: owner.token,
      },
    );

    expect(list.body.find((it) => it.id === todo.id)?.labels).toEqual([
      "needs review",
    ]);
  });

  it("treats a label in another case as the same label", async () => {
    const owner = await makeUser("owner");
    const todo = await makeTodo(owner, owner.boardId);

    await add(owner, todo.id, "Bug");
    const again = await add(owner, todo.id, "bug");

    expect(again.status).toBe(200);
    expect(again.body.labels).toEqual(["Bug"]);
  });

  it("keeps both of two different labels added at the same moment", async () => {
    const owner = await makeUser("owner");
    const editor = await makeUser("editor");

    await addMember(owner.boardId, editor, "editor", owner.id);

    const todo = await makeTodo(owner, owner.boardId);

    await Promise.all([
      add(owner, todo.id, "frontend"),
      add(editor, todo.id, "urgent"),
    ]);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
    });

    expect([...row.labels].sort()).toEqual(["frontend", "urgent"]);
  });

  it("refuses a 21st label with a clear message and changes nothing", async () => {
    const owner = await makeUser("owner");
    const todo = await makeTodo(owner, owner.boardId);

    for (let i = 0; i < 20; i += 1) await add(owner, todo.id, `l${i}`);

    const response = await add(owner, todo.id, "one too many");

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain("up to 20 labels");
    expect(
      (await prisma.todos.findUniqueOrThrow({ where: { id: todo.id } })).labels,
    ).toHaveLength(20);
  });

  it("rejects an empty or over-long label", async () => {
    const owner = await makeUser("owner");
    const todo = await makeTodo(owner, owner.boardId);

    expect((await add(owner, todo.id, "   ")).status).toBe(400);
    expect((await add(owner, todo.id, "x".repeat(41))).status).toBe(400);
    expect((await add(owner, todo.id, "tab\there")).status).toBe(200);
    expect((await add(owner, todo.id, "bell\u0007")).status).toBe(400);
  });

  it("removes case-insensitively and idempotently, keeping the others in order", async () => {
    const owner = await makeUser("owner");
    const todo = await makeTodo(owner, owner.boardId);

    for (const name of ["a", "B", "c"]) await add(owner, todo.id, name);

    expect((await remove(owner, todo.id, "b")).body.labels).toEqual(["a", "c"]);
    expect((await remove(owner, todo.id, "b")).status).toBe(200);
  });

  it("removes a label shaped like a path segment without touching the work item", async () => {
    const owner = await makeUser("owner");
    const todo = await makeTodo(owner, owner.boardId);

    for (const name of ["..", "a/b", "x&name=y"])
      await add(owner, todo.id, name);

    expect((await remove(owner, todo.id, "..")).body.labels).toEqual([
      "a/b",
      "x&name=y",
    ]);
    expect((await remove(owner, todo.id, "a/b")).body.labels).toEqual([
      "x&name=y",
    ]);
    expect((await remove(owner, todo.id, "x&name=y")).body.labels).toEqual([]);
    expect(await prisma.todos.count({ where: { id: todo.id } })).toBe(1);
  });

  it("lets a viewer read labels but not change them", async () => {
    const owner = await makeUser("owner");
    const viewer = await makeUser("viewer");

    await addMember(owner.boardId, viewer, "viewer", owner.id);

    const todo = await makeTodo(owner, owner.boardId);

    await add(owner, todo.id, "kept");

    expect((await add(viewer, todo.id, "nope")).status).toBe(403);
    expect((await remove(viewer, todo.id, "kept")).status).toBe(403);

    const read = await client.get<Todo>(`/api/v1/todos/${todo.id}`, {
      token: viewer.token,
    });

    expect(read.body.labels).toEqual(["kept"]);
  });

  it("answers a non-member 404", async () => {
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");
    const todo = await makeTodo(owner, owner.boardId);

    expect((await add(stranger, todo.id, "x")).status).toBe(404);
  });

  it("records what was added and removed in the history", async () => {
    const owner = await makeUser("owner");
    const todo = await makeTodo(owner, owner.boardId);

    await add(owner, todo.id, "first");
    await remove(owner, todo.id, "first");

    const rows = await prisma.activities.findMany({
      where: { entity_id: todo.id, action: "labels_changed" },
      orderBy: { created_at: "asc" },
    });

    expect(rows.map((row) => row.payload)).toMatchObject([
      { from: [], to: ["first"] },
      { from: ["first"], to: [] },
    ]);
    expect(rows[0]!.actor_id).toBe(owner.id);
  });

  it("is not writable through the board's PATCH", async () => {
    const owner = await makeUser("owner");
    const todo = await makeTodo(owner, owner.boardId);

    await client.patch(
      `/api/v1/boards/${owner.boardId}/todos/${todo.id}`,
      { title: "Renamed", labels: ["sneaked"] },
      { token: owner.token },
    );

    expect(
      (await prisma.todos.findUniqueOrThrow({ where: { id: todo.id } })).labels,
    ).toEqual([]);
  });
});
