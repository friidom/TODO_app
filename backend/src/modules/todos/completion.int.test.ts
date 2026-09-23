import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, makeUser, type TestUser } from "../../testing/fixtures.js";
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

  const first = (category: string): string => {
    const row = rows.find((candidate) => candidate.category === category);

    if (row === undefined) throw new Error(`no ${category} column on the provisioned board`);

    return row.id;
  };

  return {
    todo: first("todo"),
    doing: first("in_progress"),
    review: first("in_review"),
    done: first("done"),
  };
}

async function addTodo(
  columnId: string | null,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();

  const response = await client.patch(
    `/api/v1/boards/${boardId}/todos/${id}`,
    { title: "card", column_id: columnId, rank: 1024, ...extra },
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
    select: { completed_at: true, completed_by: true, column_id: true, updated_at: true },
  });
}

// The milestone's central invariant, asserted over every row rather than the
// one the test happened to touch: completed_at is set exactly when the card's
// column is a done column. Every figure in the admin dashboards is derived
// from this holding.
async function assertInvariant(): Promise<void> {
  const rows = await prisma.todos.findMany({
    select: { id: true, completed_at: true, columns: { select: { category: true } } },
  });

  expect(rows.length).toBeGreaterThan(0);

  for (const row of rows) {
    const shouldBeDone = row.columns?.category === "done";

    expect({ id: row.id, done: row.completed_at !== null }).toEqual({
      id: row.id,
      done: shouldBeDone,
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

describe("the todos-side trigger", () => {
  // From review, not todo: the workflow refuses anything but a single step into
  // done, and what this is about is the trigger firing on entry to done.
  it("stamps on entering a done column, and credits the assignee", async () => {
    const todo = await addTodo(cols.review, { assignee_id: owner.id });

    expect((await readTodo(todo)).completed_at).toBeNull();

    await move(todo, cols.done);

    const after = await readTodo(todo);

    expect(after.completed_at).not.toBeNull();
    expect(after.completed_by).toBe(owner.id);
    await assertInvariant();
  });

  it("clears on leaving a done column", async () => {
    const todo = await addTodo(cols.done, { assignee_id: owner.id });

    expect((await readTodo(todo)).completed_at).not.toBeNull();

    await move(todo, cols.doing);

    const after = await readTodo(todo);

    expect(after.completed_at).toBeNull();
    expect(after.completed_by).toBeNull();
    await assertInvariant();
  });

  it("clears when a card goes to the backlog", async () => {
    const todo = await addTodo(cols.done);

    await move(todo, null);

    expect((await readTodo(todo)).completed_at).toBeNull();
    await assertInvariant();
  });

  it("stamps a card created straight into a done column", async () => {
    const todo = await addTodo(cols.done, { assignee_id: owner.id });

    const after = await readTodo(todo);

    expect(after.completed_at).not.toBeNull();
    expect(after.completed_by).toBe(owner.id);
  });

  // A reshuffle inside the done column must not re-date the work: otherwise
  // dragging yesterday's cards around inflates today's figure.
  it("does not re-date done to done", async () => {
    const second = await client.post(
      `/api/v1/boards/${boardId}/columns`,
      { title: "Shipped", category: "done" },
      { token: owner.token },
    );

    const shipped = (second.body as { id: string }).id;
    const todo = await addTodo(cols.done);
    const first = (await readTodo(todo)).completed_at;

    await move(todo, shipped);

    expect((await readTodo(todo)).completed_at).toEqual(first);
    await assertInvariant();
  });

  it("leaves completed_by null when nobody was assigned", async () => {
    const todo = await addTodo(cols.review);

    await move(todo, cols.done);

    const after = await readTodo(todo);

    expect(after.completed_at).not.toBeNull();
    expect(after.completed_by).toBeNull();
  });

  // D-6: credit is stamped, not looked up live. A history that changes when
  // somebody tidies a board is not a history.
  it("does not move historical credit when finished work is reassigned", async () => {
    const other = await makeUser("other");

    await addMember(boardId, other, "editor", owner.id);

    const todo = await addTodo(cols.review, { assignee_id: owner.id });

    await move(todo, cols.done);

    await client.patch(
      `/api/v1/boards/${boardId}/todos/${todo}`,
      { assignee_id: other.id },
      { token: owner.token },
    );

    const after = await readTodo(todo);

    expect(after.completed_by).toBe(owner.id);
    expect(after.completed_at).not.toBeNull();
  });
});

describe("the columns-side trigger", () => {
  it("completes every card in a column when its category flips to done", async () => {
    const a = await addTodo(cols.doing, { assignee_id: owner.id });
    const b = await addTodo(cols.doing);

    await setCategory(cols.doing, "done");

    expect((await readTodo(a)).completed_at).not.toBeNull();
    expect((await readTodo(a)).completed_by).toBe(owner.id);
    expect((await readTodo(b)).completed_at).not.toBeNull();
    expect((await readTodo(b)).completed_by).toBeNull();
    await assertInvariant();
  });

  it("clears them again when the category flips back", async () => {
    const a = await addTodo(cols.doing);

    await setCategory(cols.doing, "done");
    await setCategory(cols.doing, "in_progress");

    const after = await readTodo(a);

    expect(after.completed_at).toBeNull();
    expect(after.completed_by).toBeNull();
    await assertInvariant();
  });

  it("leaves other columns alone", async () => {
    const elsewhere = await addTodo(cols.todo);

    await setCategory(cols.doing, "done");

    expect((await readTodo(elsewhere)).completed_at).toBeNull();
  });

  // A rename is not a category change, and must not touch a single stamp.
  it("does not re-date anything when only the title changes", async () => {
    const todo = await addTodo(cols.done);
    const before = (await readTodo(todo)).completed_at;

    await client.patch(`/api/v1/columns/${cols.done}`, { title: "Shipped" }, { token: owner.token });

    expect((await readTodo(todo)).completed_at).toEqual(before);
    await assertInvariant();
  });
});

describe("deleting a column", () => {
  it("leaves the rehomed cards consistent with where they landed", async () => {
    const fromDone = await addTodo(cols.done);
    const fromDoing = await addTodo(cols.doing);

    await client.del(
      `/api/v1/columns/${cols.done}`,
      { moveToColumnId: cols.doing },
      { token: owner.token },
    );

    expect((await readTodo(fromDone)).completed_at).toBeNull();
    expect((await readTodo(fromDoing)).completed_at).toBeNull();
    await assertInvariant();
  });

  it("stamps cards rehomed into a done column", async () => {
    const card = await addTodo(cols.doing, { assignee_id: owner.id });

    await client.del(
      `/api/v1/columns/${cols.doing}`,
      { moveToColumnId: cols.done },
      { token: owner.token },
    );

    const after = await readTodo(card);

    expect(after.completed_at).not.toBeNull();
    expect(after.completed_by).toBe(owner.id);
    await assertInvariant();
  });
});

describe("the invariant survives an arbitrary sequence", () => {
  it("agrees for every row after moves, renames, category flips and a deletion", async () => {
    const cards = [
      await addTodo(cols.todo, { assignee_id: owner.id }),
      await addTodo(cols.doing),
      await addTodo(cols.done, { assignee_id: owner.id }),
      await addTodo(null),
    ];

    await move(cards[0]!, cols.done);
    await setCategory(cols.doing, "done");
    await client.patch(`/api/v1/columns/${cols.todo}`, { title: "Inbox" }, { token: owner.token });
    await move(cards[2]!, cols.todo);
    await setCategory(cols.doing, "todo");
    await move(cards[3]!, cols.done);
    await setCategory(cols.done, "in_progress");
    await setCategory(cols.done, "done");
    await move(cards[1]!, cols.done);

    await assertInvariant();
  });
});

describe("admin_audit_log is append-only", () => {
  it("refuses an update and a delete, whoever asks", async () => {
    const row = await prisma.admin_audit_log.create({
      data: {
        actor_id: owner.id,
        action: "kpi.updated",
        target_type: "kpi_target",
        target_id: "junior",
      },
    });

    await expect(
      prisma.admin_audit_log.update({ where: { id: row.id }, data: { action: "tampered" } }),
    ).rejects.toThrow(/append-only/);

    await expect(prisma.admin_audit_log.delete({ where: { id: row.id } })).rejects.toThrow(
      /append-only/,
    );

    expect(await prisma.admin_audit_log.count()).toBe(1);
  });
});
