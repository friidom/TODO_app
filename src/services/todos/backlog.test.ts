import { describe, expect, it } from "vitest";

import type { IColumn, Sprint, Todo } from "@/types/data";
import { byBacklogRank } from "@/utils/backlogRank";
import {
  boardEntryOnActiveSprint,
  buildBacklogBoard,
  firstTodoColumn,
  isOnBoard,
  sprintAssignmentPatch,
} from "./backlog";
import { resolveDropIndex } from "./dropIndex";

let seq = 0;

function todo(over: Partial<Todo> & { id: string }): Todo {
  seq += 1;

  return {
    board_id: "b-1",
    column_id: "col-1",
    parent_id: null,
    sprint_id: null,
    backlog_rank: null,
    type: "Task",
    title: `todo ${over.id}`,
    // monotonic across the whole file — byBacklogRank falls back to created_at to break ties
    created_at: new Date(Date.UTC(2026, 7, 1, 0, 0, seq)).toISOString(),
    ...over,
  } as Todo;
}

function sprint(over: Partial<Sprint> & { id: string }): Sprint {
  return {
    board_id: "b-1",
    name: `Sprint ${over.id}`,
    goal: null,
    start_date: null,
    end_date: null,
    state: "future",
    rank: 1024,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: null,
    ...over,
  } as Sprint;
}

function column(over: Partial<IColumn> & { id: string }): IColumn {
  return {
    board_id: "b-1",
    title: over.id,
    category: "todo",
    rank: 1024,
    position: 0,
    min_limit: null,
    max_limit: null,
    ...over,
  } as IColumn;
}

describe("isOnBoard — Sprints ON", () => {
  const ON = true;

  it("no active Sprint: unplanned work in a column is off the board", () => {
    expect(
      isOnBoard(todo({ id: "a", column_id: "col-1", sprint_id: null }), null, ON),
    ).toBe(false);
  });

  it("no active Sprint: a card committed to a Sprint stays off", () => {
    expect(
      isOnBoard(todo({ id: "b", column_id: "col-1", sprint_id: "s-1" }), null, ON),
    ).toBe(false);
  });

  it("no active Sprint: a card with no column doesn't qualify either", () => {
    expect(isOnBoard(todo({ id: "a", column_id: null }), null, ON)).toBe(false);
  });

  it("active Sprint: its own item, with a column, qualifies", () => {
    expect(
      isOnBoard(todo({ id: "a", column_id: "col-1", sprint_id: "s-1" }), "s-1", ON),
    ).toBe(true);
  });

  it("active Sprint: an item with no column at all does not qualify", () => {
    expect(
      isOnBoard(todo({ id: "a", column_id: null, sprint_id: "s-1" }), "s-1", ON),
    ).toBe(false);
  });

  it("active Sprint: a Future Sprint's item stays off, even with a column", () => {
    expect(
      isOnBoard(todo({ id: "b", column_id: "col-1", sprint_id: "s-2" }), "s-1", ON),
    ).toBe(false);
  });

  // The backlog never leaks onto the board: being unplanned is not the same as
  // being in the running sprint, however many columns the card has passed through.
  it("active Sprint: an unplanned item is NOT on the board alongside it", () => {
    expect(
      isOnBoard(todo({ id: "c", column_id: "col-1", sprint_id: null }), "s-1", ON),
    ).toBe(false);
  });

  it("starting a Sprint makes its planned items eligible: column_id is what start_sprint writes", () => {
    const planned = todo({ id: "a", column_id: null, sprint_id: "s-1" });

    expect(isOnBoard(planned, "s-1", ON)).toBe(false);

    const startedOntoBoard = { ...planned, column_id: "todo-1" };

    expect(isOnBoard(startedOntoBoard, "s-1", ON)).toBe(true);
  });

  // rehomeUnfinished clears sprint_id and keeps column_id, so the only thing
  // that takes carried work off the board is this rule.
  it("completing a Sprint takes its unfinished work off the board", () => {
    const inSprint = todo({ id: "a", column_id: "col-1", sprint_id: "s-1" });

    expect(isOnBoard(inSprint, "s-1", ON)).toBe(true);

    const carried = { ...inSprint, sprint_id: null };

    expect(isOnBoard(carried, null, ON)).toBe(false);
  });
});

// boards.sprints_enabled = false (migration 0020). A column is the whole rule
// again — the board a team gets when it does not plan in sprints. Without this,
// turning the feature off would empty the board rather than simplify it.
describe("isOnBoard — Sprints OFF", () => {
  const OFF = false;

  it("a card with a column is on the board whatever its sprint", () => {
    for (const sprintId of [null, "s-1", "s-2"]) {
      expect(
        isOnBoard(todo({ id: "a", column_id: "col-1", sprint_id: sprintId }), null, OFF),
        String(sprintId),
      ).toBe(true);
    }
  });

  it("still refuses a card with no column — the backlog stays the backlog", () => {
    expect(
      isOnBoard(todo({ id: "a", column_id: null, sprint_id: "s-1" }), "s-1", OFF),
    ).toBe(false);
  });

  it("ignores the active sprint entirely", () => {
    const card = todo({ id: "a", column_id: "col-1", sprint_id: "s-2" });

    expect(isOnBoard(card, "s-1", OFF)).toBe(true);
    expect(isOnBoard(card, null, OFF)).toBe(true);
  });
});

describe("buildBacklogBoard — sprint sections", () => {
  it("gives every future/active sprint its own section", () => {
    const future = sprint({ id: "s-1", state: "future", rank: 2 });
    const active = sprint({ id: "s-2", state: "active", rank: 1 });

    const board = buildBacklogBoard([], [future, active]);

    expect(board.sprintSections.map((s) => s.sprint.id)).toEqual([
      "s-2",
      "s-1",
    ]);
  });

  it("omits a completed sprint — its planning is over", () => {
    const done = sprint({ id: "s-1", state: "completed" });

    const board = buildBacklogBoard([], [done]);

    expect(board.sprintSections).toHaveLength(0);
  });

  it("lists a sprint's items regardless of whether they have a column yet", () => {
    const s = sprint({ id: "s-1" });
    const notStarted = todo({ id: "t-1", sprint_id: "s-1", column_id: null });
    const onBoard = todo({ id: "t-2", sprint_id: "s-1", column_id: "col-1" });

    const board = buildBacklogBoard([notStarted, onBoard], [s]);

    expect(board.sprintSections[0].items.map((t) => t.id)).toEqual([
      "t-1",
      "t-2",
    ]);
  });

  it("orders a section's items by backlog_rank", () => {
    const s = sprint({ id: "s-1" });
    const second = todo({ id: "t-1", sprint_id: "s-1", backlog_rank: 2000 });
    const first = todo({ id: "t-2", sprint_id: "s-1", backlog_rank: 1000 });

    const board = buildBacklogBoard([second, first], [s]);

    expect(board.sprintSections[0].items.map((t) => t.id)).toEqual([
      "t-2",
      "t-1",
    ]);
  });

  it("does not mix one sprint's items into another's section", () => {
    const a = sprint({ id: "s-1" });
    const b = sprint({ id: "s-2" });
    const inA = todo({ id: "t-1", sprint_id: "s-1" });
    const inB = todo({ id: "t-2", sprint_id: "s-2" });

    const board = buildBacklogBoard([inA, inB], [a, b]);

    expect(board.sprintSections[0].items.map((t) => t.id)).toEqual(["t-1"]);
    expect(board.sprintSections[1].items.map((t) => t.id)).toEqual(["t-2"]);
  });
});

describe("buildBacklogBoard — unplanned", () => {
  it("lists a work item with neither a sprint nor a column", () => {
    const orphan = todo({ id: "t-1", sprint_id: null, column_id: null });

    const board = buildBacklogBoard([orphan], []);

    expect(board.unplanned.map((t) => t.id)).toEqual(["t-1"]);
  });

  it("lists a work item already on the Board, as long as it has no sprint", () => {
    const onBoard = todo({ id: "t-1", sprint_id: null, column_id: "col-1" });

    const board = buildBacklogBoard([onBoard], []);

    expect(board.unplanned.map((t) => t.id)).toEqual(["t-1"]);
  });

  it("excludes a work item planned into a sprint, even with no column yet", () => {
    const planned = todo({ id: "t-1", sprint_id: "s-1", column_id: null });

    const board = buildBacklogBoard([planned], [sprint({ id: "s-1" })]);

    expect(board.unplanned).toHaveLength(0);
  });

  it("orders unplanned items by backlog_rank", () => {
    const second = todo({ id: "t-1", column_id: null, backlog_rank: 2000 });
    const first = todo({ id: "t-2", column_id: null, backlog_rank: 1000 });

    const board = buildBacklogBoard([second, first], []);

    expect(board.unplanned.map((t) => t.id)).toEqual(["t-2", "t-1"]);
  });
});

describe("firstTodoColumn", () => {
  it("picks the lowest-rank 'todo'-category column", () => {
    const columns = [
      column({ id: "in-review", category: "in_progress", rank: 1 }),
      column({ id: "todo-2", category: "todo", rank: 3 }),
      column({ id: "todo-1", category: "todo", rank: 2 }),
    ];

    expect(firstTodoColumn(columns)?.id).toBe("todo-1");
  });

  it("is null when the board has no 'todo' column", () => {
    const columns = [column({ id: "done-1", category: "done" })];

    expect(firstTodoColumn(columns)).toBeNull();
  });
});

describe("boardEntryOnActiveSprint", () => {
  it("appends to the first todo column when it has room", () => {
    const columns = [column({ id: "todo-1", category: "todo" })];
    const todos = [todo({ id: "t-1", column_id: "todo-1", rank: 500 })];

    const entry = boardEntryOnActiveSprint(columns, todos);

    expect(entry).toEqual({ column_id: "todo-1", rank: 500 + 1024 });
  });

  it("is null when the board has no 'todo' column", () => {
    expect(boardEntryOnActiveSprint([], [])).toBeNull();
  });
});

describe("sprintAssignmentPatch", () => {
  const activeColumns = [column({ id: "todo-1", category: "todo" })];

  it("Task A -> Sprint 1 (active): assigns a column, since it has none", () => {
    const taskA = todo({ id: "a", column_id: null, sprint_id: null });

    const patch = sprintAssignmentPatch(
      taskA,
      "sprint-1",
      "sprint-1",
      activeColumns,
      [taskA],
    );

    expect(patch.sprint_id).toBe("sprint-1");
    expect(patch.column_id).toBe("todo-1");
    expect(patch.rank).toBe(1024);
  });

  it("Task B -> Sprint 2 (future, not the active one): no column", () => {
    const taskB = todo({ id: "b", column_id: null, sprint_id: null });

    const patch = sprintAssignmentPatch(
      taskB,
      "sprint-2",
      "sprint-1",
      activeColumns,
      [taskB],
    );

    expect(patch.sprint_id).toBe("sprint-2");
    expect(patch.column_id).toBeUndefined();
  });

  it("removing from every Sprint clears the column too", () => {
    const item = todo({ id: "c", column_id: "todo-1", sprint_id: "sprint-1" });

    const patch = sprintAssignmentPatch(item, null, "sprint-1", activeColumns, [
      item,
    ]);

    expect(patch).toEqual({
      sprint_id: null,
      column_id: null,
      backlog_rank: 1024,
    });
  });

  it("never touches a column the item already has", () => {
    const item = todo({
      id: "d",
      column_id: "already-on-board",
      sprint_id: null,
    });

    const patch = sprintAssignmentPatch(
      item,
      "sprint-1",
      "sprint-1",
      activeColumns,
      [item],
    );

    expect(patch.column_id).toBeUndefined();
  });

  it("backlog_rank appends to the destination section, excluding the item itself", () => {
    const moving = todo({ id: "e", sprint_id: "sprint-1", backlog_rank: 5000 });
    const sibling = todo({
      id: "f",
      sprint_id: "sprint-2",
      backlog_rank: 2000,
    });

    const patch = sprintAssignmentPatch(
      moving,
      "sprint-2",
      null,
      activeColumns,
      [moving, sibling],
    );

    expect(patch.backlog_rank).toBe(2000 + 1024);
  });

  it("dropIndex places backlog_rank between the two neighbours at that gap", () => {
    const moving = todo({ id: "e", sprint_id: null, backlog_rank: 9000 });
    const first = todo({ id: "f", sprint_id: "sprint-1", backlog_rank: 1000 });
    const second = todo({ id: "g", sprint_id: "sprint-1", backlog_rank: 2000 });

    // gap 1 sits between first and second
    const patch = sprintAssignmentPatch(
      moving,
      "sprint-1",
      null,
      activeColumns,
      [moving, first, second],
      1,
    );

    expect(patch.backlog_rank).toBe(1500);
  });

  it("excludes a genuine Subtask from the destination section's neighbour lookup", () => {
    // regression: an unfiltered raw cache seats the hidden subtask as a real neighbour of the drop
    const parent = todo({ id: "parent-task", sprint_id: null });
    const subtask = todo({
      id: "hidden-subtask",
      parent_id: "parent-task",
      sprint_id: null,
      backlog_rank: 1500,
    });
    const first = todo({ id: "a", sprint_id: null, backlog_rank: 1000 });
    const second = todo({ id: "b", sprint_id: null, backlog_rank: 2000 });
    const moving = todo({ id: "e", sprint_id: "sprint-1", backlog_rank: 9000 });

    const patch = sprintAssignmentPatch(
      moving,
      null,
      null,
      activeColumns,
      [moving, parent, subtask, first, second],
      1,
    );

    // without the fix this lands at 1250, between first and the invisible subtask
    expect(patch.backlog_rank).toBe(1500);
  });

  it("dropIndex exhaustion falls back to appending", () => {
    const moving = todo({ id: "e", sprint_id: null, backlog_rank: 9000 });
    const tied1 = todo({ id: "f", sprint_id: "sprint-1", backlog_rank: 1000 });
    const tied2 = todo({ id: "g", sprint_id: "sprint-1", backlog_rank: 1000 });

    const patch = sprintAssignmentPatch(
      moving,
      "sprint-1",
      null,
      activeColumns,
      [moving, tied1, tied2],
      1,
    );

    expect(patch.backlog_rank).toBe(1000 + 1024);
  });

  it("a reorder within the same section only changes backlog_rank — column/sprint untouched", () => {
    // regression: the old "leaving every sprint" branch cleared column_id on in-place reorders too
    const moving = todo({
      id: "e",
      sprint_id: null,
      column_id: "already-on-board",
      backlog_rank: 3000,
    });
    const sibling = todo({ id: "f", sprint_id: null, backlog_rank: 1000 });

    const patch = sprintAssignmentPatch(
      moving,
      null,
      null,
      activeColumns,
      [moving, sibling],
      1,
    );

    expect(patch).toEqual({ backlog_rank: 1000 + 1024 });
  });
});

// the property that matters: wherever the drop indicator showed is where the card actually lands.
// runs the real pipeline end to end since past bugs lived in the seam between its pieces, not inside one of them.
describe("drop position — one source of truth", () => {
  const columns = [
    { id: "todo-1", board_id: "b-1", title: "To do", category: "todo" },
  ] as IColumn[];

  const at = (day: number) =>
    `2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`;

  function section(): Todo[] {
    return ["a", "b", "c", "d"].map((id, i) =>
      todo({
        id,
        sprint_id: null,
        column_id: null,
        backlog_rank: null,
        created_at: at(i + 1),
      }),
    );
  }

  const rendered = (rows: Todo[]) =>
    buildBacklogBoard(rows, [])
      .unplanned.map((row) => row.id)
      .join("");

  function drag(rows: Todo[], id: string, gap: number): Todo[] {
    const visible = buildBacklogBoard(rows, []).unplanned;

    // stored list, reached in the cache's own (different) fetch order
    const full = rows
      .slice()
      .reverse()
      .filter((row) => row.sprint_id === null)
      .sort(byBacklogRank);

    const dragged = rows.find((row) => row.id === id)!;
    const dropIndex = resolveDropIndex(full, visible, gap, id);

    const fields = sprintAssignmentPatch(
      dragged,
      null,
      null,
      columns,
      rows,
      dropIndex,
    );

    return rows.map((row) => (row.id === id ? { ...row, ...fields } : row));
  }

  it("starts in creation order when nothing has ever been placed", () => {
    expect(rendered(section())).toBe("abcd");
  });

  it("D dropped between A and B lands between A and B", () => {
    expect(rendered(drag(section(), "d", 1))).toBe("adbc");
  });

  it("A dropped between C and D lands between C and D", () => {
    expect(rendered(drag(section(), "a", 3))).toBe("bcad");
  });

  it("B dropped at the very top lands first", () => {
    expect(rendered(drag(section(), "b", 0))).toBe("bacd");
  });

  it("C dropped past the last row lands last", () => {
    expect(rendered(drag(section(), "c", 4))).toBe("abdc");
  });

  it("survives repeated reordering — every drop lands where it was shown", () => {
    let rows = section();

    for (let i = 0; i < 12; i += 1) {
      const before = buildBacklogBoard(rows, []).unplanned;
      const mover = before[i % before.length].id;
      const gap = (i * 3) % (before.length + 1);

      const anchor = before[gap]?.id ?? null;
      const without = before.filter((row) => row.id !== mover);
      const at =
        anchor && anchor !== mover
          ? without.findIndex((row) => row.id === anchor)
          : without.length;

      const promised = without.map((row) => row.id);
      promised.splice(at === -1 ? without.length : at, 0, mover);

      rows = drag(rows, mover, gap);

      expect(rendered(rows)).toBe(promised.join(""));
    }
  });
});
