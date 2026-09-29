import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import type { WorkflowStage } from "../../lib/workflow.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import {
  addMember,
  makeUser,
  stageStatuses,
  workflowDraft,
  type TestUser,
} from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";
import type { PublishWorkflowInput } from "../workflow/workflow.schema.js";

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

async function addTodo(
  statusId: string | null,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();

  const response = await client.patch(
    `/api/v1/boards/${boardId}/todos/${id}`,
    { title: "card", status_id: statusId, rank: 1024, ...extra },
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

async function publish(change: (draft: PublishWorkflowInput) => PublishWorkflowInput) {
  const response = await client.put(
    `/api/v1/boards/${boardId}/workflow`,
    change(await workflowDraft(boardId)),
    { token: owner.token },
  );

  expect(response.status).toBe(200);
}

function setCategory(statusId: string, category: WorkflowStage) {
  return publish((draft) => ({
    ...draft,
    statuses: draft.statuses.map((it) => (it.id === statusId ? { ...it, category } : it)),
  }));
}

function rename(statusId: string, name: string) {
  return publish((draft) => ({
    ...draft,
    statuses: draft.statuses.map((it) => (it.id === statusId ? { ...it, name } : it)),
  }));
}

// Deletes the status and the column it is alone in, moving its cards to `to`.
function remove(statusId: string, to: string) {
  return publish((draft) => {
    const column = draft.statuses.find((it) => it.id === statusId)!.column_id;

    return {
      ...draft,
      columns: draft.columns.filter((it) => it.id !== column),
      statuses: draft.statuses.filter((it) => it.id !== statusId),
      migrations: [{ from: statusId, to }],
    };
  });
}

function readTodo(id: string) {
  return prisma.todos.findUniqueOrThrow({
    where: { id },
    select: { completed_at: true, completed_by: true, status_id: true, updated_at: true },
  });
}

// The milestone's central invariant, asserted over every row rather than the
// one the test happened to touch: completed_at is set exactly when the card's
// status is a done status. Every figure in the admin dashboards is derived
// from this holding.
async function assertInvariant(): Promise<void> {
  const rows = await prisma.todos.findMany({
    select: { id: true, completed_at: true, statuses: { select: { category: true } } },
  });

  expect(rows.length).toBeGreaterThan(0);

  for (const row of rows) {
    const shouldBeDone = row.statuses?.category === "done";

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

describe("the todos-side trigger", () => {
  // From review, not todo: the workflow refuses anything but a single step into
  // done, and what this is about is the trigger firing on entry to done.
  it("stamps on entering a done status, and credits the assignee", async () => {
    const todo = await addTodo(statuses.review, { assignee_id: owner.id });

    expect((await readTodo(todo)).completed_at).toBeNull();

    await move(todo, statuses.done);

    const after = await readTodo(todo);

    expect(after.completed_at).not.toBeNull();
    expect(after.completed_by).toBe(owner.id);
    await assertInvariant();
  });

  it("clears on leaving a done status", async () => {
    const todo = await addTodo(statuses.done, { assignee_id: owner.id });

    expect((await readTodo(todo)).completed_at).not.toBeNull();

    await move(todo, statuses.doing);

    const after = await readTodo(todo);

    expect(after.completed_at).toBeNull();
    expect(after.completed_by).toBeNull();
    await assertInvariant();
  });

  it("clears when a card goes to the backlog", async () => {
    const todo = await addTodo(statuses.done);

    await move(todo, null);

    expect((await readTodo(todo)).completed_at).toBeNull();
    await assertInvariant();
  });

  it("stamps a card created straight into a done status", async () => {
    const todo = await addTodo(statuses.done, { assignee_id: owner.id });

    const after = await readTodo(todo);

    expect(after.completed_at).not.toBeNull();
    expect(after.completed_by).toBe(owner.id);
  });

  // A move between two done statuses must not re-date the work: otherwise
  // tidying yesterday's cards inflates today's figure.
  it("does not re-date done to done", async () => {
    const shipped = randomUUID();

    await publish((draft) => {
      const doneColumn = draft.statuses.find((it) => it.id === statuses.done)!.column_id;

      return {
        ...draft,
        statuses: [
          ...draft.statuses,
          { id: shipped, column_id: doneColumn, name: "Shipped", category: "done", is_hidden: false },
        ],
        transitions: [...draft.transitions, { from: statuses.done, to: shipped }],
      };
    });

    const todo = await addTodo(statuses.done);
    const first = (await readTodo(todo)).completed_at;

    await move(todo, shipped);

    expect((await readTodo(todo)).status_id).toBe(shipped);
    expect((await readTodo(todo)).completed_at).toEqual(first);
    await assertInvariant();
  });

  it("leaves completed_by null when nobody was assigned", async () => {
    const todo = await addTodo(statuses.review);

    await move(todo, statuses.done);

    const after = await readTodo(todo);

    expect(after.completed_at).not.toBeNull();
    expect(after.completed_by).toBeNull();
  });

  // D-6: credit is stamped, not looked up live. A history that changes when
  // somebody tidies a board is not a history.
  it("does not move historical credit when finished work is reassigned", async () => {
    const other = await makeUser("other");

    await addMember(boardId, other, "editor", owner.id);

    const todo = await addTodo(statuses.review, { assignee_id: owner.id });

    await move(todo, statuses.done);

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

describe("the statuses-side trigger", () => {
  it("completes every card in a status when its category flips to done", async () => {
    const a = await addTodo(statuses.doing, { assignee_id: owner.id });
    const b = await addTodo(statuses.doing);

    await setCategory(statuses.doing, "done");

    expect((await readTodo(a)).completed_at).not.toBeNull();
    expect((await readTodo(a)).completed_by).toBe(owner.id);
    expect((await readTodo(b)).completed_at).not.toBeNull();
    expect((await readTodo(b)).completed_by).toBeNull();
    await assertInvariant();
  });

  it("clears them again when the category flips back", async () => {
    const a = await addTodo(statuses.doing);

    await setCategory(statuses.doing, "done");
    await setCategory(statuses.doing, "in_progress");

    const after = await readTodo(a);

    expect(after.completed_at).toBeNull();
    expect(after.completed_by).toBeNull();
    await assertInvariant();
  });

  it("leaves other statuses alone", async () => {
    const elsewhere = await addTodo(statuses.todo);

    await setCategory(statuses.doing, "done");

    expect((await readTodo(elsewhere)).completed_at).toBeNull();
  });

  // A rename is not a category change, and must not touch a single stamp.
  it("does not re-date anything when only the name changes", async () => {
    const todo = await addTodo(statuses.done);
    const before = (await readTodo(todo)).completed_at;

    await rename(statuses.done, "Shipped");

    expect((await readTodo(todo)).completed_at).toEqual(before);
    await assertInvariant();
  });

  // Moving a status to another column changes no card's status.
  it("does not re-date anything when a status moves column", async () => {
    const todo = await addTodo(statuses.done);
    const before = (await readTodo(todo)).completed_at;

    await publish((draft) => {
      const reviewColumn = draft.statuses.find((it) => it.id === statuses.review)!.column_id;

      return {
        ...draft,
        statuses: draft.statuses.map((it) =>
          it.id === statuses.done ? { ...it, column_id: reviewColumn } : it,
        ),
      };
    });

    expect((await readTodo(todo)).completed_at).toEqual(before);
    await assertInvariant();
  });
});

describe("deleting a status", () => {
  it("leaves the migrated cards consistent with where they landed", async () => {
    const fromDone = await addTodo(statuses.done);
    const fromDoing = await addTodo(statuses.doing);

    await remove(statuses.done, statuses.doing);

    expect((await readTodo(fromDone)).completed_at).toBeNull();
    expect((await readTodo(fromDoing)).completed_at).toBeNull();
    await assertInvariant();
  });

  it("stamps cards migrated into a done status", async () => {
    const card = await addTodo(statuses.doing, { assignee_id: owner.id });

    await remove(statuses.doing, statuses.done);

    const after = await readTodo(card);

    expect(after.completed_at).not.toBeNull();
    expect(after.completed_by).toBe(owner.id);
    await assertInvariant();
  });
});

describe("the invariant survives an arbitrary sequence", () => {
  it("agrees for every row after moves, renames, category flips and a deletion", async () => {
    const cards = [
      await addTodo(statuses.todo, { assignee_id: owner.id }),
      await addTodo(statuses.doing),
      await addTodo(statuses.done, { assignee_id: owner.id }),
      await addTodo(statuses.review),
      await addTodo(null),
    ];

    await move(cards[0]!, statuses.done);
    await setCategory(statuses.doing, "done");
    await rename(statuses.todo, "Inbox");
    await move(cards[2]!, statuses.todo);
    await setCategory(statuses.doing, "todo");
    await move(cards[4]!, statuses.done);
    await setCategory(statuses.done, "in_progress");
    await setCategory(statuses.done, "done");
    await move(cards[1]!, statuses.done);
    await remove(statuses.review, statuses.done);

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
