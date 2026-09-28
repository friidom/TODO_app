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

interface Workflow {
  workflow_version: number;
  columns: { id: string; title: string | null; rank: number | null }[];
  statuses: {
    id: string;
    column_id: string;
    name: string;
    category: string;
    rank: number;
    is_hidden: boolean;
  }[];
}

type Role = "owner" | "admin" | "editor" | "viewer";

async function setup(role: Role = "owner") {
  const owner = await makeUser("owner");

  if (role === "owner") return { owner, actor: owner, boardId: owner.boardId };

  const member = await makeUser(role);

  await addMember(owner.boardId, member, role, owner.id);

  return { owner, actor: member, boardId: owner.boardId };
}

function workflowUrl(boardId: string): string {
  return `/api/v1/boards/${boardId}/workflow`;
}

function publish(actor: TestUser, boardId: string, body: unknown) {
  return client.put<Workflow>(workflowUrl(boardId), body, { token: actor.token });
}

async function read(actor: TestUser, boardId: string): Promise<Workflow> {
  const response = await client.get<Workflow>(workflowUrl(boardId), { token: actor.token });

  expect(response.status).toBe(200);

  return response.body;
}

async function makeTodo(actor: TestUser, boardId: string, statusId: string, title: string) {
  const response = await client.post<{ id: string; rank: number }>(
    `/api/v1/boards/${boardId}/todos`,
    { title, status_id: statusId },
    { token: actor.token },
  );

  expect(response.status).toBe(201);

  return response.body;
}

async function cardsIn(statusId: string) {
  return prisma.todos.findMany({
    where: { status_id: statusId },
    orderBy: [{ rank: "asc" }, { position: "asc" }],
    select: { id: true, title: true, rank: true, completed_at: true },
  });
}

describe("GET /boards/:boardId/workflow", () => {
  it("returns the version, the columns in order and one status per provisioned column", async () => {
    const { actor, boardId } = await setup("viewer");
    const workflow = await read(actor, boardId);

    expect(workflow.workflow_version).toBe(1);
    expect(workflow.columns.map((column) => column.title)).toEqual([
      "To Do",
      "In Progress",
      "In Review",
      "Done",
    ]);
    expect(workflow.statuses.map((status) => [status.name, status.category, status.is_hidden])).toEqual([
      ["To Do", "todo", false],
      ["In Progress", "in_progress", false],
      ["In Review", "in_review", false],
      ["Done", "done", false],
    ]);
    expect(workflow.statuses.map((status) => status.column_id)).toEqual(
      workflow.columns.map((column) => column.id),
    );
  });

  it("answers 404 for a non-member", async () => {
    const { boardId } = await setup();
    const outsider = await makeUser("outsider");

    expect((await client.get(workflowUrl(boardId), { token: outsider.token })).status).toBe(404);
  });
});

describe("PUT /boards/:boardId/workflow — who may publish", () => {
  it.each<[Role, number]>([
    ["owner", 200],
    ["admin", 200],
    ["editor", 403],
    ["viewer", 403],
  ])("%s gets %i", async (role, expected) => {
    const { actor, boardId } = await setup(role);
    const draft = await workflowDraft(boardId);

    const response = await publish(actor, boardId, {
      ...draft,
      columns: draft.columns.map((column, index) =>
        index === 0 ? { ...column, title: "Renamed" } : column,
      ),
    });

    expect(response.status).toBe(expected);

    const version = (await prisma.boards.findUniqueOrThrow({ where: { id: boardId } }))
      .workflow_version;

    expect(version).toBe(expected === 200 ? 2 : 1);
  });

  it("answers 404 for a non-member", async () => {
    const { boardId } = await setup();
    const outsider = await makeUser("outsider");

    const response = await publish(outsider, boardId, await workflowDraft(boardId));

    expect(response.status).toBe(404);
  });
});

describe("publishing", () => {
  it("applies every kind of change in one publish", async () => {
    const { actor, boardId } = await setup();
    const draft = await workflowDraft(boardId);
    const [todoColumn, progressColumn, reviewColumn, doneColumn] = draft.columns;
    const [todo, progress, review, done] = draft.statuses;
    const blocked = { id: randomUUID(), title: "Blocked" };
    const waiting = {
      id: randomUUID(),
      column_id: progressColumn!.id,
      name: "Waiting",
      category: "in_progress" as const,
      is_hidden: false,
    };

    const response = await publish(actor, boardId, {
      ...draft,
      columns: [
        todoColumn,
        { ...progressColumn!, title: "Doing" },
        blocked,
        doneColumn,
        reviewColumn,
      ],
      statuses: [
        { ...todo!, name: "Open" },
        waiting,
        progress,
        { ...review!, column_id: blocked.id, category: "in_progress" },
        { ...done!, is_hidden: true },
      ],
    });

    expect(response.status).toBe(200);

    const workflow = await read(actor, boardId);

    expect(workflow.workflow_version).toBe(2);
    expect(workflow.columns.map((column) => column.title)).toEqual([
      "To Do",
      "Doing",
      "Blocked",
      "Done",
      "In Review",
    ]);
    expect(
      workflow.statuses.map((status) => [
        status.name,
        workflow.columns.find((column) => column.id === status.column_id)!.title,
        status.category,
        status.is_hidden,
      ]),
    ).toEqual([
      ["Open", "To Do", "todo", false],
      ["Waiting", "Doing", "in_progress", false],
      ["In Progress", "Doing", "in_progress", false],
      ["In Review", "Blocked", "in_progress", false],
      ["Done", "Done", "done", true],
    ]);
    expect(response.body).toEqual(workflow);
  });

  it("restores a hidden status", async () => {
    const { actor, boardId } = await setup();
    const status = await stageStatuses(boardId);
    const draft = await workflowDraft(boardId);

    const hide = (hidden: boolean, version: number) =>
      publish(actor, boardId, {
        ...draft,
        version,
        statuses: draft.statuses.map((it) =>
          it.id === status.inReview ? { ...it, is_hidden: hidden } : it,
        ),
      });

    expect((await hide(true, 1)).status).toBe(200);
    expect((await hide(false, 2)).status).toBe(200);

    const restored = await prisma.statuses.findUniqueOrThrow({ where: { id: status.inReview } });

    expect(restored.is_hidden).toBe(false);
  });

  it("deletes an empty column and an unused status", async () => {
    const { actor, boardId } = await setup();
    const draft = await workflowDraft(boardId);
    const review = draft.statuses[2]!;

    const response = await publish(actor, boardId, {
      ...draft,
      columns: draft.columns.filter((column) => column.id !== review.column_id),
      statuses: draft.statuses.filter((status) => status.id !== review.id),
    });

    expect(response.status).toBe(200);
    expect(await prisma.columns.count({ where: { id: review.column_id } })).toBe(0);
    expect(await prisma.statuses.count({ where: { id: review.id } })).toBe(0);
  });

  // statuses_board_id_name_key is deferred for the publish, so the order the
  // two renames land in cannot matter.
  it("swaps two status names in one publish", async () => {
    const { actor, boardId } = await setup();
    const draft = await workflowDraft(boardId);

    const response = await publish(actor, boardId, {
      ...draft,
      statuses: draft.statuses.map((status) =>
        status.name === "In Progress"
          ? { ...status, name: "In Review" }
          : status.name === "In Review"
            ? { ...status, name: "In Progress" }
            : status,
      ),
    });

    expect(response.status).toBe(200);
    expect(response.body.statuses.map((status) => status.name)).toEqual([
      "To Do",
      "In Review",
      "In Progress",
      "Done",
    ]);
  });

  it("refuses two statuses with one name, whatever the case, and changes nothing", async () => {
    const { actor, boardId } = await setup();
    const draft = await workflowDraft(boardId);

    const response = await publish(actor, boardId, {
      ...draft,
      statuses: draft.statuses.map((status, index) =>
        index === 1 ? { ...status, name: "done" } : status,
      ),
    });

    expect(response.status).toBe(400);
    expect((await read(actor, boardId)).workflow_version).toBe(1);
  });

  it("refuses a status in a column the workflow does not have", async () => {
    const { actor, boardId } = await setup();
    const draft = await workflowDraft(boardId);

    const response = await publish(actor, boardId, {
      ...draft,
      statuses: [
        ...draft.statuses,
        { id: randomUUID(), column_id: randomUUID(), name: "Lost", category: "todo", is_hidden: false },
      ],
    });

    expect(response.status).toBe(400);
  });

  it("refuses a workflow with no columns", async () => {
    const { actor, boardId } = await setup();
    const draft = await workflowDraft(boardId);

    expect((await publish(actor, boardId, { ...draft, columns: [], statuses: [] })).status).toBe(400);
    expect(await prisma.columns.count({ where: { board_id: boardId } })).toBe(4);
  });

  // The id collides with a status on ANOTHER board, so the insert fails after
  // the column rename and the new column have already been written. Nothing of
  // it may survive.
  it("is one transaction: a publish that fails part-way leaves no trace", async () => {
    const { actor, boardId } = await setup();
    const other = await makeUser("other");
    const theirs = await firstStatusOf(other.boardId);
    const draft = await workflowDraft(boardId);
    const added = { id: randomUUID(), title: "New" };

    const response = await publish(actor, boardId, {
      ...draft,
      columns: [{ ...draft.columns[0]!, title: "Renamed" }, ...draft.columns.slice(1), added],
      statuses: [
        ...draft.statuses,
        { id: theirs.id, column_id: added.id, name: "Stolen", category: "todo", is_hidden: false },
      ],
    });

    expect(response.status).toBe(409);

    const after = await read(actor, boardId);

    expect(after.workflow_version).toBe(1);
    expect(after.columns.map((column) => column.title)).toEqual([
      "To Do",
      "In Progress",
      "In Review",
      "Done",
    ]);
    expect(
      (await prisma.statuses.findUniqueOrThrow({ where: { id: theirs.id } })).board_id,
    ).toBe(other.boardId);
  });

  it("writes status activity as the publisher", async () => {
    const { actor, boardId } = await setup("admin");
    const draft = await workflowDraft(boardId);

    await prisma.activities.deleteMany({ where: { board_id: boardId } });

    await publish(actor, boardId, {
      ...draft,
      statuses: draft.statuses.map((status, index) =>
        index === 0 ? { ...status, name: "Open" } : status,
      ),
    });

    const activity = await prisma.activities.findFirstOrThrow({
      where: { board_id: boardId, entity_type: "status" },
    });

    expect(activity.action).toBe("renamed");
    expect(activity.actor_id).toBe(actor.id);
    expect(activity.payload).toEqual({ from: "To Do", to: "Open" });
  });

  // The "second door": a category change completes or starts every card in the
  // status without one todos row being written by the API.
  it("completes the cards of a status whose category becomes done", async () => {
    const { actor, boardId } = await setup();
    const status = await stageStatuses(boardId);
    const card = await makeTodo(actor, boardId, status.inReview, "Reviewed");
    const draft = await workflowDraft(boardId);

    await publish(actor, boardId, {
      ...draft,
      statuses: draft.statuses.map((it) =>
        it.id === status.inReview ? { ...it, category: "done" } : it,
      ),
    });

    const row = await prisma.todos.findUniqueOrThrow({ where: { id: card.id } });

    expect(row.completed_at).not.toBeNull();
    expect(row.status_id).toBe(status.inReview);
  });
});

describe("optimistic locking", () => {
  it("refuses a stale version with 409 and changes nothing", async () => {
    const { actor, boardId } = await setup();
    const stale = await workflowDraft(boardId);

    expect(
      (
        await publish(actor, boardId, {
          ...stale,
          columns: stale.columns.map((column, index) =>
            index === 0 ? { ...column, title: "First" } : column,
          ),
        })
      ).status,
    ).toBe(200);

    const response = await publish(actor, boardId, {
      ...stale,
      columns: stale.columns.map((column, index) =>
        index === 0 ? { ...column, title: "Second" } : column,
      ),
    });

    expect(response.status).toBe(409);

    const after = await read(actor, boardId);

    expect(after.workflow_version).toBe(2);
    expect(after.columns[0]!.title).toBe("First");
  });

  it("lets exactly one of two concurrent publishes from one version through", async () => {
    const { actor, boardId } = await setup();
    const draft = await workflowDraft(boardId);

    const responses = await Promise.all(
      ["A", "B"].map((title) =>
        publish(actor, boardId, {
          ...draft,
          columns: draft.columns.map((column, index) =>
            index === 0 ? { ...column, title } : column,
          ),
        }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await read(actor, boardId)).workflow_version).toBe(2);
  });
});

describe("deleting a status that holds work", () => {
  it("is refused with 409 without a migration, and nothing changes", async () => {
    const { actor, boardId } = await setup();
    const status = await stageStatuses(boardId);
    const card = await makeTodo(actor, boardId, status.todo, "Held");
    const draft = await workflowDraft(boardId);

    const response = await publish(actor, boardId, {
      ...draft,
      statuses: draft.statuses.filter((it) => it.id !== status.todo),
    });

    expect(response.status).toBe(409);
    expect(await prisma.statuses.count({ where: { id: status.todo } })).toBe(1);
    expect((await prisma.todos.findUniqueOrThrow({ where: { id: card.id } })).status_id).toBe(
      status.todo,
    );
  });

  // §10.6: cards that change column are appended after the destination's own.
  it("migrates the cards, appending them after the destination column's own", async () => {
    const { actor, boardId } = await setup();
    const status = await stageStatuses(boardId);

    await makeTodo(actor, boardId, status.todo, "moved-1");
    await makeTodo(actor, boardId, status.todo, "moved-2");
    await makeTodo(actor, boardId, status.inProgress, "stayed");

    const draft = await workflowDraft(boardId);
    const todoColumn = draft.statuses.find((it) => it.id === status.todo)!.column_id;

    await prisma.activities.deleteMany({ where: { board_id: boardId } });

    const response = await publish(actor, boardId, {
      ...draft,
      columns: draft.columns.filter((column) => column.id !== todoColumn),
      statuses: draft.statuses.filter((it) => it.id !== status.todo),
      migrations: [{ from: status.todo, to: status.inProgress }],
    });

    expect(response.status).toBe(200);
    expect((await cardsIn(status.inProgress)).map((card) => card.title)).toEqual([
      "stayed",
      "moved-1",
      "moved-2",
    ]);
    expect(await prisma.columns.count({ where: { id: todoColumn } })).toBe(0);
    expect(
      await prisma.activities.count({ where: { board_id: boardId, action: "moved" } }),
    ).toBe(2);
  });

  it("keeps the cards' order when the destination is in the same column", async () => {
    const { actor, boardId } = await setup();
    const status = await stageStatuses(boardId);
    const first = await workflowDraft(boardId);
    const todoColumn = first.statuses.find((it) => it.id === status.todo)!.column_id;
    const queued = randomUUID();

    await publish(actor, boardId, {
      ...first,
      statuses: [
        ...first.statuses,
        { id: queued, column_id: todoColumn, name: "Queued", category: "todo", is_hidden: false },
      ],
    });

    const card = await makeTodo(actor, boardId, queued, "queued");
    const second = await workflowDraft(boardId);

    await publish(actor, boardId, {
      ...second,
      statuses: second.statuses.filter((it) => it.id !== queued),
      migrations: [{ from: queued, to: status.todo }],
    });

    const row = await prisma.todos.findUniqueOrThrow({ where: { id: card.id } });

    expect(row.status_id).toBe(status.todo);
    expect(row.rank).toBe(card.rank);
  });

  it("completes cards migrated into a done status", async () => {
    const { actor, boardId } = await setup();
    const status = await stageStatuses(boardId);
    const card = await makeTodo(actor, boardId, status.inReview, "Reviewed");
    const draft = await workflowDraft(boardId);

    await publish(actor, boardId, {
      ...draft,
      statuses: draft.statuses.filter((it) => it.id !== status.inReview),
      migrations: [{ from: status.inReview, to: status.done }],
    });

    const row = await prisma.todos.findUniqueOrThrow({ where: { id: card.id } });

    expect(row.status_id).toBe(status.done);
    expect(row.completed_at).not.toBeNull();
  });

  it("refuses a migration into a hidden status", async () => {
    const { actor, boardId } = await setup();
    const status = await stageStatuses(boardId);

    await makeTodo(actor, boardId, status.todo, "Held");

    const draft = await workflowDraft(boardId);

    const response = await publish(actor, boardId, {
      ...draft,
      statuses: draft.statuses
        .filter((it) => it.id !== status.todo)
        .map((it) => (it.id === status.inProgress ? { ...it, is_hidden: true } : it)),
      migrations: [{ from: status.todo, to: status.inProgress }],
    });

    expect(response.status).toBe(400);
  });

  it("refuses a migration off a status the publish keeps", async () => {
    const { actor, boardId } = await setup();
    const status = await stageStatuses(boardId);
    const draft = await workflowDraft(boardId);

    const response = await publish(actor, boardId, {
      ...draft,
      migrations: [{ from: status.todo, to: status.done }],
    });

    expect(response.status).toBe(400);
  });
});

describe("PUT /admin/boards/:id/workflow — the superadmin door", () => {
  async function superadmin(): Promise<TestUser> {
    const root = await makeUser("root");

    await prisma.users.update({ where: { id: root.id }, data: { org_role: "superadmin" } });

    return root;
  }

  it("lets a superadmin who is not a member read and publish, and audits it", async () => {
    const root = await superadmin();
    const { boardId } = await setup();

    const fetched = await client.get<Workflow>(`/api/v1/admin/boards/${boardId}/workflow`, {
      token: root.token,
    });

    expect(fetched.status).toBe(200);
    expect(fetched.body.workflow_version).toBe(1);

    const draft = await workflowDraft(boardId);

    await prisma.activities.deleteMany({ where: { board_id: boardId } });

    const response = await client.put<Workflow>(
      `/api/v1/admin/boards/${boardId}/workflow`,
      {
        ...draft,
        statuses: draft.statuses.map((status, index) =>
          index === 0 ? { ...status, name: "Open" } : status,
        ),
      },
      { token: root.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.workflow_version).toBe(2);

    const audit = await prisma.admin_audit_log.findFirstOrThrow({
      where: { action: "board.workflow_published" },
    });

    expect(audit.actor_id).toBe(root.id);
    expect(audit.target_id).toBe(boardId);

    const activity = await prisma.activities.findFirstOrThrow({
      where: { board_id: boardId, entity_type: "status" },
    });

    expect(activity.actor_id).toBe(root.id);
  });

  it("is held to the same version rule", async () => {
    const root = await superadmin();
    const { boardId } = await setup();
    const draft = await workflowDraft(boardId);

    const response = await client.put(
      `/api/v1/admin/boards/${boardId}/workflow`,
      { ...draft, version: draft.version + 5 },
      { token: root.token },
    );

    expect(response.status).toBe(409);
    expect(await prisma.admin_audit_log.count()).toBe(0);
  });

  it("answers 404 for a board that does not exist", async () => {
    const root = await superadmin();
    const { boardId } = await setup();
    const draft = await workflowDraft(boardId);
    const missing = randomUUID();

    expect(
      (await client.get(`/api/v1/admin/boards/${missing}/workflow`, { token: root.token })).status,
    ).toBe(404);
    expect(
      (await client.put(`/api/v1/admin/boards/${missing}/workflow`, draft, { token: root.token }))
        .status,
    ).toBe(404);
  });

  it("is 404 to a board's own owner, who is not a superadmin", async () => {
    const { owner, boardId } = await setup();

    const response = await client.put(
      `/api/v1/admin/boards/${boardId}/workflow`,
      await workflowDraft(boardId),
      { token: owner.token },
    );

    expect(response.status).toBe(404);
    expect((await read(owner, boardId)).workflow_version).toBe(1);
  });

  it("gives a superadmin nothing on the board's own route", async () => {
    const root = await superadmin();
    const { boardId } = await setup();

    const response = await publish(root, boardId, await workflowDraft(boardId));

    expect(response.status).toBe(404);
  });
});
