import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../db/prisma.js";
import { disconnect, resetDatabase } from "./db.js";
import { firstColumnOf, makeUser, type TestUser } from "./fixtures.js";
import { startTestServer, type TestClient } from "./httpClient.js";

let client: TestClient;

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(resetDatabase);

afterAll(async () => {
  await client.close();
  await disconnect();
});

// Every place a request body can name a row on another board. boardAccess
// guards ids in the PATH; a body is only guarded by the composite foreign keys
// and by the service, so each of these is a distinct way in.
async function twoBoards() {
  const alice = await makeUser("alice");
  const mallory = await makeUser("mallory");

  return {
    alice,
    mallory,
    aliceColumn: (await firstColumnOf(alice.boardId)).id,
    malloryColumn: (await firstColumnOf(mallory.boardId)).id,
  };
}

async function addTodo(actor: TestUser, boardId: string, columnId: string, title: string) {
  const response = await client.post<{ id: string }>(
    `/api/v1/boards/${boardId}/todos`,
    { title, column_id: columnId },
    { token: actor.token },
  );

  return response.body;
}

function is4xx(status: number): boolean {
  return status >= 400 && status < 500;
}

describe("a body cannot name a column on another board", () => {
  it("on POST /todos/:todoId/move", async () => {
    const { alice, aliceColumn, malloryColumn } = await twoBoards();
    const todo = await addTodo(alice, alice.boardId, aliceColumn, "mine");

    const response = await client.post(
      `/api/v1/todos/${todo.id}/move`,
      { column_id: malloryColumn, rank: 2048 },
      { token: alice.token },
    );

    expect(is4xx(response.status), `status ${response.status}`).toBe(true);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { column_id: true },
    });

    expect(row.column_id).toBe(aliceColumn);
  });

  it("on PATCH /boards/:boardId/todos/:todoId", async () => {
    const { alice, aliceColumn, malloryColumn } = await twoBoards();
    const todo = await addTodo(alice, alice.boardId, aliceColumn, "mine");

    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}/todos/${todo.id}`,
      { column_id: malloryColumn },
      { token: alice.token },
    );

    expect(is4xx(response.status), `status ${response.status}`).toBe(true);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { column_id: true },
    });

    expect(row.column_id).toBe(aliceColumn);
  });

  it("on a create that invents one", async () => {
    const { alice, malloryColumn } = await twoBoards();

    const response = await client.post(
      `/api/v1/boards/${alice.boardId}/todos`,
      { title: "sneaky", column_id: malloryColumn },
      { token: alice.token },
    );

    expect(is4xx(response.status), `status ${response.status}`).toBe(true);
    expect(await prisma.todos.count({ where: { column_id: malloryColumn } })).toBe(0);
  });
});

describe("a body cannot name a sprint or a parent on another board", () => {
  it("rejects a foreign sprint_id on a patch", async () => {
    const { alice, mallory, aliceColumn } = await twoBoards();
    const todo = await addTodo(alice, alice.boardId, aliceColumn, "mine");

    const theirSprint = await client.post<{ id: string }>(
      `/api/v1/boards/${mallory.boardId}/sprints`,
      { name: "Theirs" },
      { token: mallory.token },
    );

    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}/todos/${todo.id}`,
      { sprint_id: theirSprint.body.id },
      { token: alice.token },
    );

    expect(is4xx(response.status), `status ${response.status}`).toBe(true);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { sprint_id: true },
    });

    expect(row.sprint_id).toBeNull();
  });

  it("rejects a foreign parent_id on a patch", async () => {
    const { alice, mallory, aliceColumn, malloryColumn } = await twoBoards();
    const mine = await addTodo(alice, alice.boardId, aliceColumn, "mine");
    const theirs = await addTodo(mallory, mallory.boardId, malloryColumn, "theirs");

    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}/todos/${mine.id}`,
      { parent_id: theirs.id },
      { token: alice.token },
    );

    expect(is4xx(response.status), `status ${response.status}`).toBe(true);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: mine.id },
      select: { parent_id: true },
    });

    expect(row.parent_id).toBeNull();
  });
});

describe("no cross-board write leaves the other board changed", () => {
  it("leaves every one of Mallory's rows exactly as they were", async () => {
    const { alice, mallory, aliceColumn, malloryColumn } = await twoBoards();
    const theirs = await addTodo(mallory, mallory.boardId, malloryColumn, "theirs");

    await addTodo(alice, alice.boardId, aliceColumn, "mine");

    const before = await prisma.todos.findUniqueOrThrow({ where: { id: theirs.id } });

    const attempts = [
      client.patch(
        `/api/v1/boards/${alice.boardId}/todos/${theirs.id}`,
        { title: "stolen" },
        { token: alice.token },
      ),
      client.post(
        `/api/v1/todos/${theirs.id}/move`,
        { column_id: aliceColumn, rank: 1 },
        { token: alice.token },
      ),
      client.del(`/api/v1/todos/${theirs.id}`, undefined, { token: alice.token }),
      client.post(
        `/api/v1/todos/${theirs.id}/comments`,
        { content: "sneaky" },
        { token: alice.token },
      ),
    ];

    for (const [index, response] of (await Promise.all(attempts)).entries()) {
      expect(is4xx(response.status), `attempt ${index} status ${response.status}`).toBe(true);
    }

    const after = await prisma.todos.findUniqueOrThrow({ where: { id: theirs.id } });

    expect(after).toEqual(before);
    expect(await prisma.comments.count({ where: { todo_id: theirs.id } })).toBe(0);
    expect(await prisma.todos.count({ where: { board_id: mallory.boardId } })).toBe(1);
  });
});

// notify_on_assignment writes the assignee a notification carrying the board
// title, the card title and the actor name -- all three chosen by the caller.
// Assigning to a non-member therefore puts arbitrary text in a stranger inbox,
// and GET /boards/:id/invitees hands an admin the ids to aim at.
describe("work cannot be assigned to someone who is not on the board", () => {
  it("refuses the assignment and writes nothing to the stranger inbox", async () => {
    const { alice, aliceColumn } = await twoBoards();
    const victim = await makeUser("victim");

    await client.patch(
      "/api/v1/users/me",
      { full_name: "Security Team" },
      { token: alice.token },
    );

    const response = await client.post(
      `/api/v1/boards/${alice.boardId}/todos`,
      {
        title: "Reset your password at evil.example",
        column_id: aliceColumn,
        assignee_id: victim.id,
      },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
    expect(await prisma.notifications.count({ where: { user_id: victim.id } })).toBe(0);
    expect(await prisma.todos.count({ where: { assignee_id: victim.id } })).toBe(0);
  });

  it("refuses it on the upsert path too", async () => {
    const { alice, aliceColumn } = await twoBoards();
    const victim = await makeUser("victim");
    const todo = await addTodo(alice, alice.boardId, aliceColumn, "mine");

    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}/todos/${todo.id}`,
      { assignee_id: victim.id },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
    expect(await prisma.notifications.count({ where: { user_id: victim.id } })).toBe(0);
  });

  it("still allows assigning a real member", async () => {
    const { alice, aliceColumn } = await twoBoards();
    const colleague = await makeUser("colleague");

    const { addMember } = await import("./fixtures.js");

    await addMember(alice.boardId, colleague, "editor", alice.id);

    const response = await client.post(
      `/api/v1/boards/${alice.boardId}/todos`,
      { title: "real work", column_id: aliceColumn, assignee_id: colleague.id },
      { token: alice.token },
    );

    expect(response.status).toBe(201);
    expect(await prisma.notifications.count({ where: { user_id: colleague.id } })).toBe(1);
  });
});
