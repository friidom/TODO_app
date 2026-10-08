import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SUBTASK_COLUMNS,
  DEFAULT_SUBTASK_TABLE,
  arrangeSubtasks,
  isDefaultSubtaskColumns,
  isDefaultSubtaskTable,
  normalizeSubtaskTable,
  readSubtaskTable,
  subtaskGrid,
  toggleSubtaskColumn,
  writeSubtaskTable,
} from "./subtaskTable";
import type { IStatus, Todo } from "@/types/data";

const todo = (over: Partial<Todo> & { id: string }): Todo =>
  ({
    board_id: "board-1",
    status_id: "st-todo",
    parent_id: "parent",
    type: "Task",
    priority: null,
    created_at: "2026-08-28T10:00:00.000Z",
    title: `todo ${over.id}`,
    ...over,
  }) as Todo;

const status = (id: string, category: IStatus["category"]): IStatus =>
  ({ id, category, board_id: "board-1", name: id }) as IStatus;

// board order: to do, doing, done
const STATUSES = [
  status("st-todo", "todo"),
  status("st-doing", "in_progress"),
  status("st-done", "done"),
];

const ids = (rows: Todo[]) => rows.map((row) => row.id);

describe("normalizeSubtaskTable", () => {
  it("answers the default for anything that is not an object", () => {
    for (const junk of [null, undefined, "priority", 4, []]) {
      expect(normalizeSubtaskTable(junk)).toEqual(DEFAULT_SUBTASK_TABLE);
    }
  });

  it("puts columns in table order, drops unknown and repeated ones", () => {
    expect(
      normalizeSubtaskTable({
        columns: ["due", "bogus", "priority", "due", 7],
      }).columns,
    ).toEqual(["priority", "due"]);
  });

  it("keeps an emptied column list rather than restoring the default", () => {
    expect(normalizeSubtaskTable({ columns: [] }).columns).toEqual([]);
  });

  it("repairs hideDone and sort on their own", () => {
    expect(normalizeSubtaskTable({ hideDone: "yes", sort: "nope" })).toEqual({
      ...DEFAULT_SUBTASK_TABLE,
    });

    expect(normalizeSubtaskTable({ hideDone: true, sort: "status" })).toEqual({
      columns: [...DEFAULT_SUBTASK_COLUMNS],
      hideDone: true,
      sort: "status",
    });
  });
});

describe("toggleSubtaskColumn", () => {
  it("removes a shown column", () => {
    expect(toggleSubtaskColumn(["priority", "status"], "priority")).toEqual([
      "status",
    ]);
  });

  it("adds a column in table order, not at the end", () => {
    expect(toggleSubtaskColumn(["priority", "status"], "assignee")).toEqual([
      "priority",
      "assignee",
      "status",
    ]);
  });

  it("does not mutate its input", () => {
    const columns = ["priority"] as const;

    toggleSubtaskColumn(columns, "status");

    expect(columns).toEqual(["priority"]);
  });
});

describe("isDefaultSubtaskTable", () => {
  it("is true only for the stock columns, sort and visibility", () => {
    expect(isDefaultSubtaskTable(DEFAULT_SUBTASK_TABLE)).toBe(true);
    expect(
      isDefaultSubtaskTable({ ...DEFAULT_SUBTASK_TABLE, hideDone: true }),
    ).toBe(false);
    expect(
      isDefaultSubtaskTable({ ...DEFAULT_SUBTASK_TABLE, sort: "priority" }),
    ).toBe(false);
    expect(
      isDefaultSubtaskTable({ ...DEFAULT_SUBTASK_TABLE, columns: ["status"] }),
    ).toBe(false);
  });
});

describe("isDefaultSubtaskColumns", () => {
  it("is true only for the stock set in the stock order", () => {
    expect(isDefaultSubtaskColumns(["priority", "assignee", "status"])).toBe(
      true,
    );
    expect(isDefaultSubtaskColumns(["priority", "assignee"])).toBe(false);
    expect(
      isDefaultSubtaskColumns(["priority", "assignee", "status", "due"]),
    ).toBe(false);
    expect(isDefaultSubtaskColumns([])).toBe(false);
  });
});

describe("subtaskGrid", () => {
  it("gives Work the slack and each shown column a fixed track, in order", () => {
    expect(subtaskGrid(["priority", "assignee", "status"]).template).toBe(
      "minmax(12rem,1fr) 7rem 9rem 8rem",
    );
  });

  it("is just the Work track when no column is shown", () => {
    expect(subtaskGrid([])).toEqual({
      template: "minmax(12rem,1fr)",
      minWidth: "13.5rem",
    });
  });

  it("adds up the tracks, the gaps and the row padding for the minimum width", () => {
    // 12 + (7 + 9 + 8) + 0.5 * 3 + 1.5
    expect(subtaskGrid(["priority", "assignee", "status"]).minWidth).toBe(
      "39rem",
    );
  });

  it("grows with every extra column", () => {
    const base = parseFloat(subtaskGrid(["status"]).minWidth);
    const more = parseFloat(subtaskGrid(["status", "estimate"]).minWidth);

    expect(more).toBeGreaterThan(base);
  });
});

describe("arrangeSubtasks", () => {
  const rows = [
    todo({
      id: "b",
      priority: "low",
      status_id: "st-done",
      created_at: "2026-08-28T11:00:00.000Z",
    }),
    todo({
      id: "a",
      priority: "highest",
      status_id: "st-doing",
      created_at: "2026-08-28T12:00:00.000Z",
    }),
    todo({
      id: "c",
      priority: null,
      status_id: "st-todo",
      created_at: "2026-08-28T10:00:00.000Z",
    }),
  ];

  const base = { hideDone: false, sort: "created" as const };

  it("orders by creation", () => {
    expect(ids(arrangeSubtasks(rows, base, STATUSES))).toEqual(["c", "b", "a"]);
  });

  it("orders by priority, highest first and unprioritised last", () => {
    expect(
      ids(arrangeSubtasks(rows, { ...base, sort: "priority" }, STATUSES)),
    ).toEqual(["a", "b", "c"]);
  });

  it("orders by the board's status order", () => {
    expect(
      ids(arrangeSubtasks(rows, { ...base, sort: "status" }, STATUSES)),
    ).toEqual(["c", "a", "b"]);
  });

  it("puts a card with no status last when sorting by status", () => {
    const withBacklog = [...rows, todo({ id: "z", status_id: null })];

    expect(
      ids(arrangeSubtasks(withBacklog, { ...base, sort: "status" }, STATUSES)),
    ).toEqual(["c", "a", "b", "z"]);
  });

  it("breaks ties by creation order", () => {
    const tied = [
      todo({
        id: "late",
        priority: "high",
        created_at: "2026-09-01T00:00:00Z",
      }),
      todo({
        id: "early",
        priority: "high",
        created_at: "2026-08-01T00:00:00Z",
      }),
    ];

    expect(
      ids(arrangeSubtasks(tied, { ...base, sort: "priority" }, STATUSES)),
    ).toEqual(["early", "late"]);
  });

  it("hides what is in a done-category status", () => {
    expect(
      ids(arrangeSubtasks(rows, { ...base, hideDone: true }, STATUSES)),
    ).toEqual(["c", "a"]);
  });

  it("does not mutate the array it is given", () => {
    const before = ids(rows);

    arrangeSubtasks(rows, { ...base, sort: "priority" }, STATUSES);

    expect(ids(rows)).toEqual(before);
  });
});

describe("storage", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};

    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  it("round-trips a choice", () => {
    const prefs = {
      columns: ["priority", "due"] as const,
      hideDone: true,
      sort: "priority" as const,
    };

    writeSubtaskTable({ ...prefs, columns: [...prefs.columns] });

    expect(readSubtaskTable()).toEqual({
      ...prefs,
      columns: [...prefs.columns],
    });
  });

  it("removes the entry once it is back to the default", () => {
    writeSubtaskTable({ ...DEFAULT_SUBTASK_TABLE, hideDone: true });
    expect(store["subtasks:table"]).toBeDefined();

    writeSubtaskTable(DEFAULT_SUBTASK_TABLE);
    expect(store["subtasks:table"]).toBeUndefined();
  });

  it("falls back to the default rather than throwing on unreadable storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readSubtaskTable()).toEqual(DEFAULT_SUBTASK_TABLE);
    expect(() =>
      writeSubtaskTable({ ...DEFAULT_SUBTASK_TABLE, hideDone: true }),
    ).not.toThrow();
  });

  it("falls back to the default on a corrupt entry", () => {
    store["subtasks:table"] = "{not json";

    expect(readSubtaskTable()).toEqual(DEFAULT_SUBTASK_TABLE);
  });
});
