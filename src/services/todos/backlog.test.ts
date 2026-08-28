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
    // Monotonic across the whole file, not `% 10` — `byBacklogRank` now
    // falls back to `created_at` to break a tie between two unranked rows
    // (both default to `backlog_rank: null` here), so a wrapping counter
    // would silently reintroduce "the order the row happened to land in this
    // particular array", the exact bug that fallback exists to remove.
    // `Date.UTC` normalises overflow past 59 seconds correctly, so this stays
    // ordered for any number of calls a single test file makes.
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

/**
 * The Board's own visibility rule.
 *
 * `column_id` is the necessary fact and `sprint_id` can only take a card
 * away: a card committed to a Sprint that is not the running one is withheld
 * until that Sprint starts, and everything else in a column is on the Board.
 * This is the independence the sprints migration designed the two columns
 * around — see `backlog.ts`'s module doc for the pass that conflated them and
 * what it broke.
 */
describe("isOnBoard", () => {
  it("no active Sprint: unplanned work in a column still shows", () => {
    // The board a user had before Sprints existed, and the board a brand new
    // user has today. Nothing has claimed these cards, so nothing withholds
    // them.
    expect(
      isOnBoard(todo({ id: "a", column_id: "col-1", sprint_id: null }), null),
    ).toBe(true);
  });

  it("no active Sprint: a card committed to a Sprint stays off", () => {
    // Planned into a future Sprint. It keeps its column, but it is not
    // uncommitted work and it is not this-Sprint work, so it waits.
    expect(
      isOnBoard(todo({ id: "b", column_id: "col-1", sprint_id: "s-1" }), null),
    ).toBe(false);
  });

  it("no active Sprint: a card with no column doesn't qualify either", () => {
    expect(isOnBoard(todo({ id: "a", column_id: null }), null)).toBe(false);
  });

  it("active Sprint: its own item, with a column, qualifies", () => {
    expect(
      isOnBoard(todo({ id: "a", column_id: "col-1", sprint_id: "s-1" }), "s-1"),
    ).toBe(true);
  });

  it("active Sprint: an item with no column at all does not qualify", () => {
    // Planned into the active Sprint but not yet started onto the Board —
    // `start_sprint` hasn't run, or ran before this item was added to it.
    expect(
      isOnBoard(todo({ id: "a", column_id: null, sprint_id: "s-1" }), "s-1"),
    ).toBe(false);
  });

  it("active Sprint: a Future Sprint's item stays off, even with a column", () => {
    // The one exclusion the Sprint model is actually for: work committed
    // somewhere else does not leak onto the running board.
    expect(
      isOnBoard(todo({ id: "b", column_id: "col-1", sprint_id: "s-2" }), "s-1"),
    ).toBe(false);
  });

  it("active Sprint: a no-Sprint item is on the board alongside it", () => {
    // Ad-hoc work — the card someone typed straight into a column. It sits
    // beside the Sprint's own cards rather than being hidden by them, which
    // is what keeps the quick-add from creating invisible cards.
    expect(
      isOnBoard(todo({ id: "c", column_id: "col-1", sprint_id: null }), "s-1"),
    ).toBe(true);
  });

  it("starting a Sprint makes its planned items eligible: column_id is what start_sprint writes", () => {
    // `start_sprint` (the RPC) bulk-assigns a column to every item of the
    // Sprint it starts that has none yet — this is the client-side half of
    // that contract: once a Sprint's item has both the matching sprint_id
    // and the column the RPC gave it, isOnBoard flips from false to true
    // with no other input changing.
    const planned = todo({ id: "a", column_id: null, sprint_id: "s-1" });

    expect(isOnBoard(planned, "s-1")).toBe(false);

    const startedOntoBoard = { ...planned, column_id: "todo-1" };

    expect(isOnBoard(startedOntoBoard, "s-1")).toBe(true);
  });

  it("completing a Sprint leaves its unfinished work on the board as unplanned", () => {
    // `complete_sprint` rehomes everything not in a done column to the
    // destination Sprint, or to the Backlog (sprint_id null) — it does not
    // clear column_id. Under this rule that card stays visible as unplanned
    // work rather than vanishing the moment the Sprint ends.
    const carried = todo({ id: "a", column_id: "col-1", sprint_id: null });

    expect(isOnBoard(carried, null)).toBe(true);
  });
});

describe("buildBacklogBoard — sprint sections", () => {
  it("gives every future/active sprint its own section", () => {
    const future = sprint({ id: "s-1", state: "future", rank: 2 });
    const active = sprint({ id: "s-2", state: "active", rank: 1 });

    const board = buildBacklogBoard([], [future, active]);

    // Ordered by rank, not creation order.
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
    // A pre-M29 task, already on the Board and never touched by sprint
    // planning, must still surface here — this is exactly what makes it
    // plannable into a Sprint from this page. It stays on the Board at the
    // same time, because Board membership is `column_id` alone.
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

    // Gap 1 sits between `first` and `second`.
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
    // The bug this guards: `todos` here is the raw board cache, "cards and
    // Subtasks alike" — and a genuine Subtask always carries `sprint_id:
    // null`, so an unfiltered destination section would seat it as a real
    // neighbour of the ungrouped Backlog the moment a drop targets it, even
    // though `visible` (what `dropIndex` was actually counted over) never
    // rendered it at all.
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

    // Gap 1, as the user saw it: between `first` and `second` — the
    // Subtask, invisible on the page, was never one of the two rows either
    // side of the indicator.
    const patch = sprintAssignmentPatch(
      moving,
      null,
      null,
      activeColumns,
      [moving, parent, subtask, first, second],
      1,
    );

    // Without the fix this lands at 1250 — between `first` (1000) and the
    // Subtask (1500) — instead of between `first` and `second`.
    expect(patch.backlog_rank).toBe(1500);
  });

  it("dropIndex exhaustion falls back to appending", () => {
    const moving = todo({ id: "e", sprint_id: null, backlog_rank: 9000 });
    // Two neighbours with no room between them.
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
    // An item already on the Board (has a column) but with no Sprint, being
    // dragged to a new position among the Backlog's own ungrouped items —
    // the M31-C regression this guards: the old "leaving every Sprint"
    // branch would have cleared `column_id` on every in-place reorder too,
    // since `targetSprintId` trivially equals `todo.sprint_id` here.
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

/**
 * The property the whole Backlog drag exists to satisfy: **the position the
 * insertion indicator showed is the position that gets persisted.**
 *
 * This drives the real pipeline end to end — `buildBacklogBoard` for the
 * rendered list, `resolveDropIndex` for the gap→stored-index translation and
 * `sprintAssignmentPatch` for the write — rather than testing any one of them
 * in isolation, because every bug this suite was written for lived in the
 * *seam* between them rather than inside one.
 *
 * The two lists are deliberately built from differently-ordered inputs. That
 * is not artificial: `visible` comes from `useVisibleTodos()`, whose `manual`
 * ordering is `orderByBoard` (column, then Board rank), while `full` comes
 * from the raw `["todos", boardId]` cache in fetch order. They are the same
 * rows in a different sequence, and the ordering must converge for the drop
 * to mean anything.
 */
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

  /** The order the page renders, which is the order the user drags among. */
  const rendered = (rows: Todo[]) =>
    buildBacklogBoard(rows, [])
      .unplanned.map((row) => row.id)
      .join("");

  /**
   * One complete drag of `id` onto gap `gap`, exactly as `useBacklogDragEnd`
   * performs it, returning the board afterwards.
   */
  function drag(rows: Todo[], id: string, gap: number): Todo[] {
    // What the page rendered — and what the gap index was counted over.
    const visible = buildBacklogBoard(rows, []).unplanned;

    // The stored list, reached from the cache in its own (different) order.
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

    // Twelve consecutive drags across every gap, each asserted against the
    // order the indicator promised for that specific drop. A single drag
    // landing correctly proves little; the failure this guards only appeared
    // once some rows had a real rank and others still did not.
    for (let i = 0; i < 12; i += 1) {
      const before = buildBacklogBoard(rows, []).unplanned;
      const mover = before[i % before.length].id;
      const gap = (i * 3) % (before.length + 1);

      // Where the user was told it would land: splice the mover in above the
      // row the gap sits on, over the list as rendered.
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
