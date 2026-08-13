import { describe, expect, it } from "vitest";

import type { BoardMember } from "../members/membersApi";
import type { IColumn, ISupabaseTodo } from "../../types/data";
import {
  EMPTY_FILTERS,
  countFilters,
  filterTodos,
  groupTodos,
  orderByBoard,
  sortTodos,
  type TodoFilters,
} from "./view";

/** Today, pinned. Every due-date expectation below is relative to this day. */
const TODAY = "2026-08-13";

const card = (id: string, fields: Partial<ISupabaseTodo> = {}): ISupabaseTodo =>
  ({
    id,
    title: `card ${id}`,
    column_id: "todo",
    position: 0,
    type: "Task",
    priority: null,
    assignee_id: null,
    due_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    ...fields,
  }) as ISupabaseTodo;

const filters = (overrides: Partial<TodoFilters> = {}): TodoFilters => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

const ids = (todos: ISupabaseTodo[]) => todos.map((todo) => todo.id);

describe("filterTodos", () => {
  // The rule the whole panel rests on: unchecking your last work type shows
  // every card again, not none of them.
  it("is the identity when nothing is selected", () => {
    const todos = [card("1"), card("2")];

    expect(filterTodos(todos, EMPTY_FILTERS, "u1", TODAY)).toBe(todos);
  });

  it("ORs the values inside one category", () => {
    const todos = [
      card("1", { type: "Bug" }),
      card("2", { type: "Story" }),
      card("3", { type: "Task" }),
    ];

    const result = filterTodos(
      todos,
      filters({ type: ["Bug", "Story"] }),
      "u1",
      TODAY,
    );

    expect(ids(result)).toEqual(["1", "2"]);
  });

  it("ANDs across categories", () => {
    const todos = [
      card("1", { type: "Bug", assignee_id: "u1" }),
      card("2", { type: "Bug", assignee_id: "u2" }),
      card("3", { type: "Task", assignee_id: "u1" }),
    ];

    const result = filterTodos(
      todos,
      filters({ type: ["Bug"], assignee: ["me"] }),
      "u1",
      TODAY,
    );

    expect(ids(result)).toEqual(["1"]);
  });

  describe("assignee", () => {
    const todos = [
      card("mine", { assignee_id: "u1" }),
      card("theirs", { assignee_id: "u2" }),
      card("nobody"),
    ];

    it("resolves `me` against the viewer, not against a stored id", () => {
      expect(
        ids(filterTodos(todos, filters({ assignee: ["me"] }), "u1", TODAY)),
      ).toEqual(["mine"]);
      expect(
        ids(filterTodos(todos, filters({ assignee: ["me"] }), "u2", TODAY)),
      ).toEqual(["theirs"]);
    });

    it("matches nothing for `me` when nobody is signed in", () => {
      expect(
        filterTodos(todos, filters({ assignee: ["me"] }), undefined, TODAY),
      ).toEqual([]);
    });

    it("finds unassigned cards", () => {
      expect(
        ids(filterTodos(todos, filters({ assignee: ["none"] }), "u1", TODAY)),
      ).toEqual(["nobody"]);
    });

    it("combines a specific member with unassigned", () => {
      const result = filterTodos(
        todos,
        filters({ assignee: ["u2", "none"] }),
        "u1",
        TODAY,
      );

      expect(ids(result)).toEqual(["theirs", "nobody"]);
    });
  });

  describe("due date", () => {
    const todos = [
      card("past", { due_date: "2026-08-01T00:00:00+00:00" }),
      card("now", { due_date: "2026-08-13T00:00:00+00:00" }),
      card("soon", { due_date: "2026-09-01T00:00:00+00:00" }),
      card("never"),
    ];

    it("buckets against the day it is given, not the wall clock", () => {
      expect(
        ids(filterTodos(todos, filters({ due: ["overdue"] }), "u1", TODAY)),
      ).toEqual(["past"]);
      expect(
        ids(filterTodos(todos, filters({ due: ["today"] }), "u1", TODAY)),
      ).toEqual(["now"]);
      expect(
        ids(filterTodos(todos, filters({ due: ["upcoming"] }), "u1", TODAY)),
      ).toEqual(["soon"]);
      expect(
        ids(filterTodos(todos, filters({ due: ["none"] }), "u1", TODAY)),
      ).toEqual(["never"]);
    });

    // A card due today at midnight UTC must not read as overdue — the same
    // boundary `dueDate.ts` exists to get right.
    it("does not call a card due today overdue", () => {
      const result = filterTodos(
        todos,
        filters({ due: ["overdue"] }),
        "u1",
        TODAY,
      );

      expect(ids(result)).not.toContain("now");
    });
  });

  it("treats a card with no priority as `none`", () => {
    const todos = [
      card("1", { priority: "high" }),
      card("2"),
      card("3", { priority: "bogus" }),
    ];

    expect(
      ids(filterTodos(todos, filters({ priority: ["none"] }), "u1", TODAY)),
    ).toEqual(["2", "3"]);
    expect(
      ids(filterTodos(todos, filters({ priority: ["high"] }), "u1", TODAY)),
    ).toEqual(["1"]);
  });

  it("filters by column, which is what status means here", () => {
    const todos = [
      card("1", { column_id: "todo" }),
      card("2", { column_id: "doing" }),
      card("3", { column_id: null }),
    ];

    expect(
      ids(filterTodos(todos, filters({ status: ["doing"] }), "u1", TODAY)),
    ).toEqual(["2"]);
  });

  it("counts every selected value for the button badge", () => {
    expect(countFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countFilters(filters({ type: ["Bug", "Task"], due: ["overdue"] })),
    ).toBe(3);
  });
});

describe("sortTodos", () => {
  // This is what makes the sort a view concern: switching away and back leaves
  // the board's dragged order untouched, because nothing was ever reordered.
  it("returns the input untouched under manual", () => {
    const todos = [card("2"), card("1")];

    expect(sortTodos(todos, "manual")).toBe(todos);
  });

  it("orders due dates as calendar days", () => {
    const todos = [
      card("late", { due_date: "2026-09-01T00:00:00+00:00" }),
      card("early", { due_date: "2026-08-01T00:00:00+00:00" }),
    ];

    expect(ids(sortTodos(todos, "due", "asc"))).toEqual(["early", "late"]);
    expect(ids(sortTodos(todos, "due", "desc"))).toEqual(["late", "early"]);
  });

  // A card with no due date is not the most overdue one, and flipping the
  // direction should not promote every unanswered card to the top.
  it("keeps cards with no value last in both directions", () => {
    const todos = [
      card("none"),
      card("late", { due_date: "2026-09-01T00:00:00+00:00" }),
      card("early", { due_date: "2026-08-01T00:00:00+00:00" }),
    ];

    expect(ids(sortTodos(todos, "due", "asc"))).toEqual([
      "early",
      "late",
      "none",
    ]);
    expect(ids(sortTodos(todos, "due", "desc"))).toEqual([
      "late",
      "early",
      "none",
    ]);
  });

  it("orders priority by urgency, never by spelling", () => {
    const todos = [
      card("low", { priority: "low" }),
      card("highest", { priority: "highest" }),
      card("high", { priority: "high" }),
      card("unset"),
    ];

    // Alphabetically "high" precedes "highest" and "low" precedes "lowest",
    // which is backwards in both pairs.
    expect(ids(sortTodos(todos, "priority", "asc"))).toEqual([
      "highest",
      "high",
      "low",
      "unset",
    ]);
  });

  it("sorts titles case-insensitively, the way a reader scans them", () => {
    const todos = [card("b", { title: "beta" }), card("a", { title: "Alpha" })];

    expect(ids(sortTodos(todos, "title", "asc"))).toEqual(["a", "b"]);
  });

  it("treats a blank title as no value", () => {
    const todos = [
      card("blank", { title: "   " }),
      card("named", { title: "zeta" }),
    ];

    expect(ids(sortTodos(todos, "title", "asc"))).toEqual(["named", "blank"]);
  });

  it("sorts by created and updated timestamps", () => {
    const todos = [
      card("new", {
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-02T00:00:00Z",
      }),
      card("old", { created_at: "2026-01-01T00:00:00Z", updated_at: null }),
    ];

    expect(ids(sortTodos(todos, "created", "asc"))).toEqual(["old", "new"]);
    // `updated_at` is nullable, so the never-updated card falls to the end.
    expect(ids(sortTodos(todos, "updated", "asc"))).toEqual(["new", "old"]);
  });

  it("leaves ties in the order they arrived", () => {
    const todos = [
      card("first", { due_date: "2026-08-01T00:00:00+00:00" }),
      card("second", { due_date: "2026-08-01T00:00:00+00:00" }),
      card("third", { due_date: "2026-08-01T00:00:00+00:00" }),
    ];

    expect(ids(sortTodos(todos, "due", "asc"))).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("does not mutate its input", () => {
    const todos = [card("2", { title: "b" }), card("1", { title: "a" })];
    const before = ids(todos);

    sortTodos(todos, "title", "asc");

    expect(ids(todos)).toEqual(before);
  });
});

const column = (id: string, title: string, position: number): IColumn =>
  ({ id, title, position, category: "todo" }) as IColumn;

const member = (id: string, full_name: string | null): BoardMember => ({
  id,
  full_name,
  username: null,
  avatar_url: null,
  role: "editor",
  joined_at: "2026-01-01T00:00:00Z",
});

/** Two columns, deliberately given out of position order. */
const COLUMNS = [column("doing", "In progress", 1), column("todo", "To do", 0)];

describe("orderByBoard", () => {
  // The cache stops being in board order the first time a card is dragged:
  // `applyTodoMoved` returns [...untouched, ...source, ...destination]. Both
  // views used to reconstruct the order separately; this is the one rule now.
  it("reads columns left to right and position top to bottom", () => {
    const todos = [
      card("d2", { column_id: "doing", position: 1 }),
      card("t2", { column_id: "todo", position: 1 }),
      card("d1", { column_id: "doing", position: 0 }),
      card("t1", { column_id: "todo", position: 0 }),
    ];

    expect(ids(orderByBoard(todos, COLUMNS))).toEqual(["t1", "t2", "d1", "d2"]);
  });

  it("puts a card with no column at the end, not the front", () => {
    const todos = [
      card("orphan", { column_id: null, position: 0 }),
      card("t1", { column_id: "todo", position: 0 }),
    ];

    expect(ids(orderByBoard(todos, COLUMNS))).toEqual(["t1", "orphan"]);
  });

  it("does not mutate the cached array it is given", () => {
    const todos = [
      card("d1", { column_id: "doing", position: 0 }),
      card("t1", { column_id: "todo", position: 0 }),
    ];

    orderByBoard(todos, COLUMNS);

    expect(ids(todos)).toEqual(["d1", "t1"]);
  });

  // Bucketing preserves array order, so the board can drop its own sort only if
  // this holds: what the list shows top to bottom is what each column shows.
  it("agrees with what each column would show on the board", () => {
    const todos = [
      card("t2", { column_id: "todo", position: 1 }),
      card("d1", { column_id: "doing", position: 0 }),
      card("t1", { column_id: "todo", position: 0 }),
    ];

    const ordered = orderByBoard(todos, COLUMNS);
    const inTodoColumn = ordered.filter((it) => it.column_id === "todo");

    expect(ids(inTodoColumn)).toEqual(["t1", "t2"]);
  });
});

describe("the view pipeline", () => {
  const ctx = { columns: COLUMNS, members: [member("u1", "Alex")] };

  // "Assigned to me, by due date, grouped by assignee" — the three controls
  // compose in one direction: filter narrows, sort orders what is left, group
  // splits what the sort produced. Nothing re-orders after grouping.
  it("filters, then sorts, then groups", () => {
    const todos = [
      card("theirs", {
        assignee_id: "u2",
        due_date: "2026-08-01T00:00:00+00:00",
      }),
      card("mine-late", {
        assignee_id: "u1",
        due_date: "2026-09-01T00:00:00+00:00",
      }),
      card("mine-undated", { assignee_id: "u1" }),
      card("mine-early", {
        assignee_id: "u1",
        due_date: "2026-08-05T00:00:00+00:00",
      }),
    ];

    const visible = filterTodos(
      todos,
      filters({ assignee: ["me"] }),
      "u1",
      TODAY,
    );
    const groups = groupTodos(
      sortTodos(visible, "due", "asc"),
      "assignee",
      ctx,
    );

    expect(groups.map((it) => it.label)).toEqual(["Alex"]);
    expect(ids(groups[0].todos)).toEqual([
      "mine-early",
      "mine-late",
      "mine-undated",
    ]);
  });

  it("keeps the board's own order when the sort is manual", () => {
    const todos = [
      card("d1", { column_id: "doing", position: 0, type: "Bug" }),
      card("t2", { column_id: "todo", position: 1, type: "Bug" }),
      card("t1", { column_id: "todo", position: 0, type: "Task" }),
    ];

    const visible = filterTodos(todos, filters({ type: ["Bug"] }), "u1", TODAY);

    // `sortTodos` is the identity under manual, so the board's order is
    // `orderByBoard`'s answer and nothing downstream re-sorts.
    expect(sortTodos(visible, "manual")).toBe(visible);
    expect(ids(orderByBoard(visible, COLUMNS))).toEqual(["t2", "d1"]);
  });
});

describe("groupTodos", () => {
  const ctx = {
    columns: COLUMNS,
    members: [member("u2", "Zara"), member("u1", "Alex")],
  };

  it("returns one unnamed group when grouping is off", () => {
    const todos = [card("1"), card("2")];
    const result = groupTodos(todos, "none", ctx);

    expect(result).toHaveLength(1);
    expect(result[0].todos).toBe(todos);
  });

  it("groups by column, in board order, keeping empty columns", () => {
    const result = groupTodos(
      [card("1", { column_id: "todo" })],
      "status",
      ctx,
    );

    // An empty column is part of the board's shape whether or not anything is
    // in it — hiding it would make the board depend on its contents.
    expect(result.map((group) => group.label)).toEqual([
      "To do",
      "In progress",
    ]);
    expect(ids(result[0].todos)).toEqual(["1"]);
    expect(result[1].todos).toEqual([]);
  });

  it("surfaces a card whose column is gone rather than losing it", () => {
    const result = groupTodos(
      [card("orphan", { column_id: null })],
      "status",
      ctx,
    );

    expect(result.at(-1)?.label).toBe("No status");
    expect(ids(result.at(-1)?.todos ?? [])).toEqual(["orphan"]);
  });

  describe("by assignee", () => {
    it("names members, sorts them, and puts unassigned last", () => {
      const todos = [
        card("1", { assignee_id: "u2" }),
        card("2", { assignee_id: "u1" }),
        card("3"),
      ];

      expect(groupTodos(todos, "assignee", ctx).map((g) => g.label)).toEqual([
        "Alex",
        "Zara",
        "Unassigned",
      ]);
    });

    it("drops members with nothing assigned to them", () => {
      const result = groupTodos(
        [card("1", { assignee_id: "u1" })],
        "assignee",
        ctx,
      );

      expect(result.map((group) => group.label)).toEqual(["Alex"]);
    });

    // `assignee_id` survives removal from the board, so these cards still have
    // to land somewhere.
    it("keeps cards assigned to somebody the roster no longer lists", () => {
      const result = groupTodos(
        [card("1", { assignee_id: "gone" })],
        "assignee",
        ctx,
      );

      expect(result.map((group) => group.label)).toEqual(["Former member"]);
    });
  });

  it("groups by work type in menu order, dropping the empty ones", () => {
    const todos = [card("1", { type: "Bug" }), card("2", { type: "Task" })];

    // WORK_TYPE_OPTIONS puts Task first because it is the default.
    expect(groupTodos(todos, "type", ctx).map((group) => group.key)).toEqual([
      "Task",
      "Bug",
    ]);
  });

  it("groups by priority in rank order with no-priority last", () => {
    const todos = [
      card("1", { priority: "low" }),
      card("2", { priority: "highest" }),
      card("3"),
    ];

    expect(
      groupTodos(todos, "priority", ctx).map((group) => group.label),
    ).toEqual(["Highest", "Low", "No priority"]);
  });

  it("loses no card, whatever the dimension", () => {
    const todos = [
      card("1", {
        assignee_id: "u1",
        type: "Bug",
        priority: "high",
        column_id: "doing",
      }),
      card("2"),
      card("3", { assignee_id: "gone" }),
    ];

    for (const group of [
      "none",
      "status",
      "assignee",
      "type",
      "priority",
    ] as const) {
      const flattened = groupTodos(todos, group, ctx).flatMap((it) => it.todos);

      expect(flattened).toHaveLength(todos.length);
    }
  });
});
