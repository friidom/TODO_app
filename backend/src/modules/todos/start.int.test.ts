import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;
let owner: TestUser;
let boardId: string;

interface Cols {
  todo: string;
  doing: string;
  review: string;
  done: string;
}

let cols: Cols;

async function columnsOf(board: string): Promise<Cols> {
  const rows = await prisma.columns.findMany({
    where: { board_id: board },
    select: { id: true, category: true },
    orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { position: "asc" }],
  });

  const of = (category: string): string[] =>
    rows.filter((row) => row.category === category).map((row) => row.id);

  const doing = of("in_progress");

  if (doing.length < 2)
    throw new Error("the provisioned board should have two in_progress columns");

  return {
    todo: of("todo")[0]!,
    doing: doing[0]!,
    review: doing[1]!,
    done: of("done")[0]!,
  };
}

async function addTodo(columnId: string | null): Promise<string> {
  const id = randomUUID();

  const response = await client.patch(
    `/api/v1/boards/${boardId}/todos/${id}`,
    { title: "card", column_id: columnId, rank: 1024 },
    { token: owner.token },
  );

  expect(response.status).toBeLessThan(300);

  return id;
}

function move(todoId: string, columnId: string | null): Promise<{ status: number }> {
  return client.patch(
    `/api/v1/boards/${boardId}/todos/${todoId}`,
    { column_id: columnId },
    { token: owner.token },
  );
}

function setCategory(columnId: string, category: string): Promise<{ status: number }> {
  return client.patch(`/api/v1/columns/${columnId}`, { category }, { token: owner.token });
}

function readTodo(id: string) {
  return prisma.todos.findUniqueOrThrow({
    where: { id },
    select: { started_at: true, completed_at: true, column_id: true },
  });
}

async function assertInvariant(): Promise<void> {
  const rows = await prisma.todos.findMany({
    select: {
      id: true,
      started_at: true,
      columns: { select: { category: true } },
    },
  });

  expect(rows.length).toBeGreaterThan(0);

  for (const row of rows) {
    const shouldBeStarted = row.columns !== null && (row.columns.category ?? "todo") !== "todo";

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
  cols = await columnsOf(boardId);
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("the todos-side start trigger", () => {
  it("leaves a card in a todo column unstarted", async () => {
    expect((await readTodo(await addTodo(cols.todo))).started_at).toBeNull();
  });

  it("leaves a card in the backlog unstarted", async () => {
    expect((await readTodo(await addTodo(null))).started_at).toBeNull();
  });

  it("stamps a card created directly into an in_progress column", async () => {
    expect((await readTodo(await addTodo(cols.doing))).started_at).not.toBeNull();
  });

  it("stamps on entering a started column", async () => {
    const todo = await addTodo(cols.todo);

    await move(todo, cols.doing);

    expect((await readTodo(todo)).started_at).not.toBeNull();
  });

  it("does not restart the clock between two started columns", async () => {
    const todo = await addTodo(cols.doing);
    const first = (await readTodo(todo)).started_at;

    await move(todo, cols.review);

    expect((await readTodo(todo)).started_at).toEqual(first);
  });

  it("keeps the start date when the card is completed", async () => {
    const todo = await addTodo(cols.doing);
    const started = (await readTodo(todo)).started_at;

    await move(todo, cols.done);
    const row = await readTodo(todo);

    expect(row.started_at).toEqual(started);
    expect(row.completed_at).not.toBeNull();
  });

  it("keeps the start date when a completed card is reopened", async () => {
    const todo = await addTodo(cols.doing);
    const started = (await readTodo(todo)).started_at;

    await move(todo, cols.done);
    await move(todo, cols.review);
    const row = await readTodo(todo);

    expect(row.started_at).toEqual(started);
    expect(row.completed_at).toBeNull();
  });

  it("clears on returning to a todo column, alongside completed_at", async () => {
    const todo = await addTodo(cols.doing);

    await move(todo, cols.done);
    await move(todo, cols.todo);
    const row = await readTodo(todo);

    expect(row.started_at).toBeNull();
    expect(row.completed_at).toBeNull();
  });

  it("clears on returning to the backlog", async () => {
    const todo = await addTodo(cols.doing);

    await move(todo, null);

    expect((await readTodo(todo)).started_at).toBeNull();
  });

  it("stamps both ends for a card dragged straight from To Do to Done", async () => {
    const todo = await addTodo(cols.todo);

    await move(todo, cols.done);
    const row = await readTodo(todo);

    expect(row.started_at).not.toBeNull();
    expect(row.completed_at).not.toBeNull();
    expect(row.completed_at!.getTime() - row.started_at!.getTime()).toBeLessThan(1000);
  });
});

describe("the columns-side start trigger — the second door", () => {
  it("starts every card when a column is flipped out of the todo category", async () => {
    const cards = [await addTodo(cols.todo), await addTodo(cols.todo)];

    await setCategory(cols.todo, "in_progress");

    for (const card of cards) expect((await readTodo(card)).started_at).not.toBeNull();
  });

  it("un-starts every card when the column is flipped back", async () => {
    const card = await addTodo(cols.todo);

    await setCategory(cols.todo, "in_progress");
    await setCategory(cols.todo, "todo");

    expect((await readTodo(card)).started_at).toBeNull();
  });

  it("leaves the clock alone when a started column is flipped to done", async () => {
    const card = await addTodo(cols.doing);
    const started = (await readTodo(card)).started_at;

    await setCategory(cols.doing, "done");
    const row = await readTodo(card);

    expect(row.started_at).toEqual(started);
    expect(row.completed_at).not.toBeNull();
  });

  it("starts the cards when a done column is flipped to todo and back", async () => {
    const card = await addTodo(cols.done);

    await setCategory(cols.done, "todo");
    expect((await readTodo(card)).started_at).toBeNull();

    await setCategory(cols.done, "in_progress");
    expect((await readTodo(card)).started_at).not.toBeNull();
  });
});

describe("what the start stamps do NOT do", () => {
  it("writes no activity rows of its own", async () => {
    const todo = await addTodo(cols.todo);

    const before = await prisma.activities.count({
      where: { entity_id: todo },
    });

    await move(todo, cols.doing);
    await move(todo, cols.review);

    const after = await prisma.activities.count({ where: { entity_id: todo } });

    expect(after - before).toBe(2);
  });

  it("is not todos.start_date, which stays whatever the user set", async () => {
    const todo = await addTodo(cols.todo);

    await client.patch(
      `/api/v1/boards/${boardId}/todos/${todo}`,
      {
        start_date: "2026-01-01T00:00:00.000Z",
        due_date: "2026-12-31T00:00:00.000Z",
      },
      { token: owner.token },
    );

    await move(todo, cols.doing);

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
      await addTodo(cols.todo),
      await addTodo(cols.doing),
      await addTodo(cols.done),
      await addTodo(null),
      await addTodo(cols.review),
    ];

    await move(cards[0]!, cols.done);
    await setCategory(cols.doing, "done");
    await client.patch(`/api/v1/columns/${cols.todo}`, { title: "Inbox" }, { token: owner.token });
    await move(cards[2]!, cols.todo);
    await setCategory(cols.doing, "todo");
    await move(cards[3]!, cols.review);
    await setCategory(cols.done, "in_progress");
    await setCategory(cols.done, "done");
    await move(cards[1]!, null);
    await move(cards[4]!, cols.todo);

    await assertInvariant();
  });
});
