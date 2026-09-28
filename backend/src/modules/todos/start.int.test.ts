import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import type { WorkflowStage } from "../../lib/workflow.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser, stageStatuses, workflowDraft, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;
let owner: TestUser;
let boardId: string;

interface Statuses {
  todo: string;
  doing: string;
  review: string;
  done: string;
}

let statuses: Statuses;

async function addTodo(statusId: string | null): Promise<string> {
  const id = randomUUID();

  const response = await client.patch(
    `/api/v1/boards/${boardId}/todos/${id}`,
    { title: "card", status_id: statusId, rank: 1024 },
    { token: owner.token },
  );

  expect(response.status).toBeLessThan(300);

  return id;
}

function move(todoId: string, statusId: string | null): Promise<{ status: number }> {
  return client.patch(
    `/api/v1/boards/${boardId}/todos/${todoId}`,
    { status_id: statusId },
    { token: owner.token },
  );
}

async function editStatus(
  statusId: string,
  change: { category?: WorkflowStage; name?: string },
): Promise<void> {
  const draft = await workflowDraft(boardId);

  const response = await client.put(
    `/api/v1/boards/${boardId}/workflow`,
    {
      ...draft,
      statuses: draft.statuses.map((it) => (it.id === statusId ? { ...it, ...change } : it)),
    },
    { token: owner.token },
  );

  expect(response.status).toBe(200);
}

function setCategory(statusId: string, category: WorkflowStage): Promise<void> {
  return editStatus(statusId, { category });
}

function readTodo(id: string) {
  return prisma.todos.findUniqueOrThrow({
    where: { id },
    select: { started_at: true, completed_at: true, status_id: true },
  });
}

async function assertInvariant(): Promise<void> {
  const rows = await prisma.todos.findMany({
    select: {
      id: true,
      started_at: true,
      statuses: { select: { category: true } },
    },
  });

  expect(rows.length).toBeGreaterThan(0);

  for (const row of rows) {
    const shouldBeStarted = row.statuses !== null && row.statuses.category !== "todo";

    expect({ id: row.id, started: row.started_at !== null }).toEqual({
      id: row.id,
      started: shouldBeStarted,
    });
  }
}

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();
  owner = await makeUser("owner");
  boardId = owner.boardId;

  const stages = await stageStatuses(boardId);

  statuses = {
    todo: stages.todo,
    doing: stages.inProgress,
    review: stages.inReview,
    done: stages.done,
  };
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("the todos-side start trigger", () => {
  it("leaves a card in a todo status unstarted", async () => {
    expect((await readTodo(await addTodo(statuses.todo))).started_at).toBeNull();
  });

  it("leaves a card in the backlog unstarted", async () => {
    expect((await readTodo(await addTodo(null))).started_at).toBeNull();
  });

  it("stamps a card created directly into an in_progress status", async () => {
    expect((await readTodo(await addTodo(statuses.doing))).started_at).not.toBeNull();
  });

  it("stamps on entering a started status", async () => {
    const todo = await addTodo(statuses.todo);

    await move(todo, statuses.doing);

    expect((await readTodo(todo)).started_at).not.toBeNull();
  });

  it("does not restart the clock between two started statuses", async () => {
    const todo = await addTodo(statuses.doing);
    const first = (await readTodo(todo)).started_at;

    await move(todo, statuses.review);

    expect((await readTodo(todo)).started_at).toEqual(first);
  });

  it("keeps the start date when the card is completed", async () => {
    const todo = await addTodo(statuses.review);
    const started = (await readTodo(todo)).started_at;

    await move(todo, statuses.done);
    const row = await readTodo(todo);

    expect(row.started_at).toEqual(started);
    expect(row.completed_at).not.toBeNull();
  });

  it("keeps the start date when a completed card is reopened", async () => {
    const todo = await addTodo(statuses.review);
    const started = (await readTodo(todo)).started_at;

    await move(todo, statuses.done);
    await move(todo, statuses.review);
    const row = await readTodo(todo);

    expect(row.started_at).toEqual(started);
    expect(row.completed_at).toBeNull();
  });

  it("clears on returning to a todo status, alongside completed_at", async () => {
    const todo = await addTodo(statuses.review);

    await move(todo, statuses.done);
    await move(todo, statuses.todo);
    const row = await readTodo(todo);

    expect(row.started_at).toBeNull();
    expect(row.completed_at).toBeNull();
  });

  it("clears on returning to the backlog", async () => {
    const todo = await addTodo(statuses.doing);

    await move(todo, null);

    expect((await readTodo(todo)).started_at).toBeNull();
  });

  // Created straight into Done rather than dragged there: the workflow refuses
  // a todo -> done move, but a FIRST placement is not a transition, so a card
  // can still reach done having never sat in an in_progress status — which is
  // the case this is about.
  it("stamps both ends for a card that never sat in an in_progress status", async () => {
    const todo = await addTodo(statuses.done);

    const row = await readTodo(todo);

    expect(row.started_at).not.toBeNull();
    expect(row.completed_at).not.toBeNull();
    expect(row.completed_at!.getTime() - row.started_at!.getTime()).toBeLessThan(1000);
  });
});

describe("the statuses-side start trigger — the second door", () => {
  it("starts every card when a status is flipped out of the todo category", async () => {
    const cards = [await addTodo(statuses.todo), await addTodo(statuses.todo)];

    await setCategory(statuses.todo, "in_progress");

    for (const card of cards) expect((await readTodo(card)).started_at).not.toBeNull();
  });

  it("un-starts every card when the status is flipped back", async () => {
    const card = await addTodo(statuses.todo);

    await setCategory(statuses.todo, "in_progress");
    await setCategory(statuses.todo, "todo");

    expect((await readTodo(card)).started_at).toBeNull();
  });

  it("leaves the clock alone when a started status is flipped to done", async () => {
    const card = await addTodo(statuses.doing);
    const started = (await readTodo(card)).started_at;

    await setCategory(statuses.doing, "done");
    const row = await readTodo(card);

    expect(row.started_at).toEqual(started);
    expect(row.completed_at).not.toBeNull();
  });

  it("starts the cards when a done status is flipped to todo and back", async () => {
    const card = await addTodo(statuses.done);

    await setCategory(statuses.done, "todo");
    expect((await readTodo(card)).started_at).toBeNull();

    await setCategory(statuses.done, "in_progress");
    expect((await readTodo(card)).started_at).not.toBeNull();
  });
});

describe("what the start stamps do NOT do", () => {
  it("writes no activity rows of its own", async () => {
    const todo = await addTodo(statuses.todo);

    const before = await prisma.activities.count({
      where: { entity_id: todo },
    });

    await move(todo, statuses.doing);
    await move(todo, statuses.review);

    const after = await prisma.activities.count({ where: { entity_id: todo } });

    expect(after - before).toBe(2);
  });

  it("is not todos.start_date, which stays whatever the user set", async () => {
    const todo = await addTodo(statuses.todo);

    await client.patch(
      `/api/v1/boards/${boardId}/todos/${todo}`,
      {
        start_date: "2026-01-01T00:00:00.000Z",
        due_date: "2026-12-31T00:00:00.000Z",
      },
      { token: owner.token },
    );

    await move(todo, statuses.doing);

    const row = await prisma.todos.findUniqueOrThrow({
      where: { id: todo },
      select: { start_date: true, started_at: true },
    });

    expect(row.start_date?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(row.started_at).not.toBeNull();
    expect(row.started_at).not.toEqual(row.start_date);
  });
});

describe("the invariant", () => {
  it("holds over every row after an arbitrary sequence of moves and flips", async () => {
    const cards = [
      await addTodo(statuses.todo),
      await addTodo(statuses.doing),
      await addTodo(statuses.done),
      await addTodo(null),
      await addTodo(statuses.review),
    ];

    await move(cards[0]!, statuses.doing);
    await setCategory(statuses.doing, "done");
    await editStatus(statuses.todo, { name: "Inbox" });
    await move(cards[2]!, statuses.todo);
    await setCategory(statuses.doing, "todo");
    await move(cards[3]!, statuses.review);
    await setCategory(statuses.done, "in_progress");
    await setCategory(statuses.done, "done");
    await move(cards[1]!, null);
    await move(cards[4]!, statuses.todo);

    await assertInvariant();
  });
});
