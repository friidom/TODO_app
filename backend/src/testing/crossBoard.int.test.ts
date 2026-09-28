import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../db/prisma.js";
import { disconnect, resetDatabase } from "./db.js";
import { firstStatusOf, makeUser, workflowDraft, type TestUser } from "./fixtures.js";
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
    aliceStatus: (await firstStatusOf(alice.boardId)).id,
    malloryStatus: (await firstStatusOf(mallory.boardId)).id,
  };
}

async function addTodo(actor: TestUser, boardId: string, statusId: string, title: string) {
  const response = await client.post<{ id: string }>(
    `/api/v1/boards/${boardId}/todos`,
    { title, status_id: statusId },
    { token: actor.token },
  );

  return response.body;
}

function is4xx(status: number): boolean {
  return status >= 400 && status < 500;
}

describe("a body cannot name a status on another board", () => {
  it("on POST /todos/:todoId/move", async () => {
    const { alice, aliceStatus, malloryStatus } = await twoBoards();
    const todo = await addTodo(alice, alice.boardId, aliceStatus, "mine");

    const response = await client.post(
      `/api/v1/todos/${todo.id}/move`,
      { status_id: malloryStatus, rank: 2048 },
      { token: alice.token },
    );

    expect(is4xx(response.status), `status ${response.status}`).toBe(true);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { status_id: true },
    });

    expect(row.status_id).toBe(aliceStatus);
  });

  it("on PATCH /boards/:boardId/todos/:todoId", async () => {
    const { alice, aliceStatus, malloryStatus } = await twoBoards();
    const todo = await addTodo(alice, alice.boardId, aliceStatus, "mine");

    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}/todos/${todo.id}`,
      { status_id: malloryStatus },
      { token: alice.token },
    );

    expect(is4xx(response.status), `status ${response.status}`).toBe(true);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo.id },
      select: { status_id: true },
    });

    expect(row.status_id).toBe(aliceStatus);
  });

  it("on a create that invents one", async () => {
    const { alice, malloryStatus } = await twoBoards();

    const response = await client.post(
      `/api/v1/boards/${alice.boardId}/todos`,
      { title: "sneaky", status_id: malloryStatus },
      { token: alice.token },
    );

    expect(is4xx(response.status), `status ${response.status}`).toBe(true);
    expect(await prisma.todos.count({ where: { status_id: malloryStatus } })).toBe(0);
  });
});

// A publish names every column and status by id, and a new one by an id the
// client minted, so a foreign id arrives looking like a new row. The primary
// key refuses it and the whole publish rolls back.
describe("a workflow publish cannot claim another board's rows", () => {
  it("refuses a foreign column id as a new column", async () => {
    const { alice, mallory } = await twoBoards();
    const theirs = await prisma.columns.findFirstOrThrow({
      where: { board_id: mallory.boardId },
      select: { id: true, title: true },
    });
    const draft = await workflowDraft(alice.boardId);

    const response = await client.put(
      `/api/v1/boards/${alice.boardId}/workflow`,
      { ...draft, columns: [...draft.columns, { id: theirs.id, title: "Mine now" }] },
      { token: alice.token },
    );

    expect(response.status).toBe(409);
    expect(
      await prisma.columns.findUniqueOrThrow({
        where: { id: theirs.id },
        select: { board_id: true, title: true },
      }),
    ).toEqual({ board_id: mallory.boardId, title: theirs.title });
  });

  it("refuses to migrate cards into a status on another board", async () => {
    const { alice, aliceStatus, malloryStatus } = await twoBoards();

    await addTodo(alice, alice.boardId, aliceStatus, "mine");

    const draft = await workflowDraft(alice.boardId);

    const response = await client.put(
      `/api/v1/boards/${alice.boardId}/workflow`,
      {
        ...draft,
        statuses: draft.statuses.filter((status) => status.id !== aliceStatus),
        migrations: [{ from: aliceStatus, to: malloryStatus }],
      },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
    expect(await prisma.todos.count({ where: { status_id: malloryStatus } })).toBe(0);
    expect(await prisma.todos.count({ where: { status_id: aliceStatus } })).toBe(1);
  });
});

describe("a body cannot name a sprint or a parent on another board", () => {
  it("rejects a foreign sprint_id on a patch", async () => {
    const { alice, mallory, aliceStatus } = await twoBoards();
    const todo = await addTodo(alice, alice.boardId, aliceStatus, "mine");

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
    const { alice, mallory, aliceStatus, malloryStatus } = await twoBoards();
    const mine = await addTodo(alice, alice.boardId, aliceStatus, "mine");
    const theirs = await addTodo(mallory, mallory.boardId, malloryStatus, "theirs");

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
    const { alice, mallory, aliceStatus, malloryStatus } = await twoBoards();
    const theirs = await addTodo(mallory, mallory.boardId, malloryStatus, "theirs");

    await addTodo(alice, alice.boardId, aliceStatus, "mine");

    const before = await prisma.todos.findUniqueOrThrow({ where: { id: theirs.id } });

    const attempts = [
      client.patch(
        `/api/v1/boards/${alice.boardId}/todos/${theirs.id}`,
        { title: "stolen" },
        { token: alice.token },
      ),
      client.post(
        `/api/v1/todos/${theirs.id}/move`,
        { status_id: aliceStatus, rank: 1 },
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
    const { alice, aliceStatus } = await twoBoards();
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
        status_id: aliceStatus,
        assignee_id: victim.id,
      },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
    expect(await prisma.notifications.count({ where: { user_id: victim.id } })).toBe(0);
    expect(await prisma.todos.count({ where: { assignee_id: victim.id } })).toBe(0);
  });

  it("refuses it on the upsert path too", async () => {
    const { alice, aliceStatus } = await twoBoards();
    const victim = await makeUser("victim");
    const todo = await addTodo(alice, alice.boardId, aliceStatus, "mine");

    const response = await client.patch(
      `/api/v1/boards/${alice.boardId}/todos/${todo.id}`,
      { assignee_id: victim.id },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
    expect(await prisma.notifications.count({ where: { user_id: victim.id } })).toBe(0);
  });

  it("still allows assigning a real member", async () => {
    const { alice, aliceStatus } = await twoBoards();
    const colleague = await makeUser("colleague");

    const { addMember } = await import("./fixtures.js");

    await addMember(alice.boardId, colleague, "editor", alice.id);

    const response = await client.post(
      `/api/v1/boards/${alice.boardId}/todos`,
      { title: "real work", status_id: aliceStatus, assignee_id: colleague.id },
      { token: alice.token },
    );

    expect(response.status).toBe(201);
    expect(await prisma.notifications.count({ where: { user_id: colleague.id } })).toBe(1);
  });
});
