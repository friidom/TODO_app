import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { disconnect, resetDatabase } from "../testing/db.js";
import { addMember, firstStatusOf, makeUser, workflowDraft } from "../testing/fixtures.js";
import { startRealtimeHarness, settle, type RealtimeHarness } from "../testing/realtimeHarness.js";
import * as todosService from "../modules/todos/todos.service.js";
import * as columnsService from "../modules/columns/columns.service.js";
import * as workflowService from "../modules/workflow/workflow.service.js";
import * as commentsService from "../modules/comments/comments.service.js";
import * as sprintsService from "../modules/sprints/sprints.service.js";
import * as boardsService from "../modules/boards/boards.service.js";
import { boardRoom } from "./io.js";
import { prisma } from "../db/prisma.js";

interface Change {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

interface Invalidate {
  boardId: string;
  scopes: string[];
}

let harness: RealtimeHarness;

beforeAll(async () => {
  harness = await startRealtimeHarness();
});

beforeEach(resetDatabase);

afterEach(() => harness.reset());

afterAll(async () => {
  await harness.close();
  await disconnect();
});

async function watcherOn(boardId: string, token: string) {
  const socket = await harness.connect(token);

  await socket.join(boardId);

  return socket;
}

describe("todo events", () => {
  it("sends an INSERT carrying the created row", async () => {
    const owner = await makeUser("owner");
    const socket = await watcherOn(owner.boardId, owner.token);
    const status = await firstStatusOf(owner.boardId);

    await todosService.create({ id: owner.id }, { id: owner.boardId, role: "owner" }, {
      title: "Write it down",
      status_id: status.id,
    });

    const event = await socket.waitFor<Change>("todo:change");

    expect(event.eventType).toBe("INSERT");
    expect(event.new).toMatchObject({ title: "Write it down", board_id: owner.boardId });
    expect(event.old).toEqual({});
  });

  it("sends an UPDATE on a patch", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const status = await firstStatusOf(owner.boardId);
    const created = await todosService.create({ id: owner.id }, board, {
      title: "Before",
      status_id: status.id,
    });

    const socket = await watcherOn(owner.boardId, owner.token);

    await todosService.upsert({ id: owner.id }, board, created.id, { title: "After" });

    const event = await socket.waitFor<Change>("todo:change");

    expect(event.eventType).toBe("UPDATE");
    expect(event.new).toMatchObject({ id: created.id, title: "After" });
  });

  it("sends an UPDATE on a move, carrying the committed row rather than the request", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const statuses = await prisma.statuses.findMany({
      where: { board_id: owner.boardId, category: { in: ["todo", "in_progress"] } },
      select: { id: true, category: true },
    });
    const from = statuses.find((status) => status.category === "todo")!.id;
    const to = statuses.find((status) => status.category === "in_progress")!.id;
    const created = await todosService.create({ id: owner.id }, board, {
      title: "Moves",
      status_id: from,
    });

    const socket = await watcherOn(owner.boardId, owner.token);

    await todosService.move({ id: owner.id }, board, created.id, {
      status_id: to,
      rank: 5000,
    });

    const event = await socket.waitFor<Change>("todo:change");

    expect(event.eventType).toBe("UPDATE");
    expect(event.new).toMatchObject({ id: created.id, status_id: to, rank: 5000 });
  });

  it("SENDS ONLY THE ID ON A DELETE", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const status = await firstStatusOf(owner.boardId);
    const created = await todosService.create({ id: owner.id }, board, {
      title: "Secret title nobody else should receive",
      status_id: status.id,
    });

    const socket = await watcherOn(owner.boardId, owner.token);

    await todosService.remove({ id: owner.id }, board, created.id);

    const event = await socket.waitFor<Change>("todo:change", (e) => e.eventType === "DELETE");

    expect(event.old).toEqual({ id: created.id });
    expect(event.new).toEqual({});
    expect(JSON.stringify(event)).not.toContain("Secret title");
  });

  it("follows a todo delete with an invalidate for what it cascaded", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const status = await firstStatusOf(owner.boardId);
    const created = await todosService.create({ id: owner.id }, board, {
      title: "Has comments",
      status_id: status.id,
    });

    const socket = await watcherOn(owner.boardId, owner.token);

    await todosService.remove({ id: owner.id }, board, created.id);

    const event = await socket.waitFor<Invalidate>("board:invalidate");

    expect(event.scopes).toEqual(["comments", "attachments"]);
  });
});

describe("column and workflow events", () => {
  it("sends an UPDATE when a column's limits change", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const { column_id: columnId } = await firstStatusOf(owner.boardId);
    const socket = await watcherOn(owner.boardId, owner.token);

    await columnsService.updateLimits({ id: owner.id }, board, columnId, { max_limit: 4 });

    const updated = await socket.waitFor<Change>("column:change");

    expect(updated.eventType).toBe("UPDATE");
    expect(updated.new).toMatchObject({ id: columnId, max_limit: 4 });
  });

  // A publish can touch every column, status and card on the board, so it is
  // described as scopes to refetch rather than row by row.
  it("invalidates the workflow and the cards once a publish commits", async () => {
    const owner = await makeUser("owner");
    const socket = await watcherOn(owner.boardId, owner.token);
    const draft = await workflowDraft(owner.boardId);

    await workflowService.publish({ id: owner.id }, owner.boardId, {
      ...draft,
      columns: draft.columns.map((column, index) =>
        index === 0 ? { ...column, title: "Open" } : column,
      ),
    });

    const invalidate = await socket.waitFor<Invalidate>("board:invalidate");

    expect(invalidate.scopes).toEqual(["workflow", "todos"]);
    expect(socket.seen("column:change")).toHaveLength(0);
  });

  it("broadcasts nothing when a publish is refused", async () => {
    const owner = await makeUser("owner");
    const socket = await watcherOn(owner.boardId, owner.token);
    const draft = await workflowDraft(owner.boardId);

    await expect(
      workflowService.publish({ id: owner.id }, owner.boardId, { ...draft, version: 99 }),
    ).rejects.toThrow();

    await settle();

    expect(socket.seen("board:invalidate")).toHaveLength(0);
  });
});

describe("comment events", () => {
  it("sends INSERT, UPDATE and an id-only DELETE", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const status = await firstStatusOf(owner.boardId);
    const todo = await todosService.create({ id: owner.id }, board, {
      title: "Discussed",
      status_id: status.id,
    });

    const socket = await watcherOn(owner.boardId, owner.token);

    const created = await commentsService.create({ id: owner.id }, board, todo.id, {
      content: "First",
    });

    expect((await socket.waitFor<Change>("comment:change")).eventType).toBe("INSERT");

    await commentsService.update({ id: owner.id }, board, created.id, { content: "Edited" });

    const updated = await socket.waitFor<Change>(
      "comment:change",
      (e) => e.eventType === "UPDATE",
    );

    expect(updated.new).toMatchObject({ id: created.id, content: "Edited" });

    await commentsService.remove({ id: owner.id }, board, created.id);

    const deleted = await socket.waitFor<Change>(
      "comment:change",
      (e) => e.eventType === "DELETE",
    );

    expect(deleted.old).toEqual({ id: created.id });
    expect(JSON.stringify(deleted)).not.toContain("Edited");
  });
});

describe("room isolation", () => {
  it("never reaches a socket on another board", async () => {
    const one = await makeUser("one");
    const two = await makeUser("two");

    const listener = await watcherOn(two.boardId, two.token);
    const status = await firstStatusOf(one.boardId);

    await todosService.create({ id: one.id }, { id: one.boardId, role: "owner" }, {
      title: "Not yours",
      status_id: status.id,
    });

    await settle();

    expect(listener.seen("todo:change")).toHaveLength(0);
  });

  it("never reaches a member who has not joined the room", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);

    const idle = await harness.connect(member.token);
    const status = await firstStatusOf(owner.boardId);

    await todosService.create({ id: owner.id }, { id: owner.boardId, role: "owner" }, {
      title: "Unwatched",
      status_id: status.id,
    });

    await settle();

    expect(idle.seen("todo:change")).toHaveLength(0);
  });
});

describe("a failed write broadcasts nothing", () => {
  it("emits no event when the create is rejected", async () => {
    const owner = await makeUser("owner");
    const socket = await watcherOn(owner.boardId, owner.token);

    await expect(
      todosService.create({ id: owner.id }, { id: owner.boardId, role: "owner" }, {
        title: "Rejected",
        assignee_id: randomUUID(),
      }),
    ).rejects.toThrow();

    await settle();

    expect(socket.seen("todo:change")).toHaveLength(0);
  });

  it("EMITS NOTHING WHEN THE TRANSACTION ROLLS BACK", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const socket = await watcherOn(owner.boardId, owner.token);

    // An Epic may not have a parent — enforce_work_item_hierarchy raises
    // inside the transaction, so the insert never commits.
    const parent = await todosService.create({ id: owner.id }, board, { title: "Parent" });

    await socket.waitFor<Change>("todo:change");

    const before = socket.seen("todo:change").length;

    await expect(
      todosService.create({ id: owner.id }, board, {
        title: "Impossible",
        type: "Epic",
        parent_id: parent.id,
      }),
    ).rejects.toThrow();

    await settle();

    expect(socket.seen("todo:change")).toHaveLength(before);
    expect(await prisma.todos.count({ where: { title: "Impossible" } })).toBe(0);
  });

  it("emits nothing when a move names a todo on another board", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");
    const socket = await watcherOn(owner.boardId, owner.token);
    const status = await firstStatusOf(other.boardId);
    const ownStatus = await firstStatusOf(owner.boardId);

    const foreign = await todosService.create({ id: other.id }, { id: other.boardId, role: "owner" }, {
      title: "Elsewhere",
      status_id: status.id,
    });

    await expect(
      todosService.move({ id: owner.id }, { id: owner.boardId, role: "owner" }, foreign.id, {
        status_id: ownStatus.id,
        rank: 1,
      }),
    ).rejects.toThrow();

    await settle();

    expect(socket.seen("todo:change")).toHaveLength(0);
  });
});

describe("multi-write operations use one coarse event", () => {
  it("invalidates todos and sprints when a sprint starts", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const sprint = await sprintsService.create({ id: owner.id }, board, { name: "Sprint 1" });

    const socket = await watcherOn(owner.boardId, owner.token);

    await sprintsService.start({ id: owner.id }, board, sprint.id);

    const event = await socket.waitFor<Invalidate>(
      "board:invalidate",
      (e) => e.scopes.includes("sprints") && e.scopes.includes("todos"),
    );

    expect(event.boardId).toBe(owner.boardId);
    expect(socket.seen("todo:change")).toHaveLength(0);
  });

  it("invalidates todos and sprints when a sprint completes", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const sprint = await sprintsService.create({ id: owner.id }, board, { name: "Sprint 1" });

    await sprintsService.start({ id: owner.id }, board, sprint.id);

    const socket = await watcherOn(owner.boardId, owner.token);

    await sprintsService.complete({ id: owner.id }, board, sprint.id, null);

    const event = await socket.waitFor<Invalidate>("board:invalidate");

    expect(event.scopes).toEqual(["sprints", "todos"]);
    expect(socket.seen("todo:change")).toHaveLength(0);
  });

  it("invalidates todos on a rebalance rather than describing every row", async () => {
    const owner = await makeUser("owner");
    const board = { id: owner.boardId, role: "owner" as const };
    const status = await firstStatusOf(owner.boardId);

    for (const title of ["a", "b", "c"]) {
      await todosService.create({ id: owner.id }, board, { title, status_id: status.id });
    }

    const socket = await watcherOn(owner.boardId, owner.token);

    await todosService.rebalanceColumn({ id: owner.id }, board, status.column_id);

    const event = await socket.waitFor<Invalidate>("board:invalidate");

    expect(event.scopes).toEqual(["todos"]);
    expect(socket.seen("todo:change")).toHaveLength(0);
  });
});

describe("board deletion", () => {
  it("invalidates and then empties the room, because the board it names is gone", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);

    const first = await watcherOn(owner.boardId, owner.token);
    const second = await watcherOn(owner.boardId, member.token);

    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))?.size).toBe(2);

    await boardsService.remove({ id: owner.id }, owner.boardId);

    const event = await first.waitFor<Invalidate>("board:invalidate");

    expect(event.scopes).toEqual(["boards"]);

    await first.waitFor<{ boardId: string }>("board:evicted");
    await second.waitFor<{ boardId: string }>("board:evicted");

    expect(harness.io.sockets.adapter.rooms.get(boardRoom(owner.boardId))).toBeUndefined();
  });
});
