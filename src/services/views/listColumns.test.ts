import { beforeEach, describe, expect, it, vi } from "vitest";

import { SORT_KEYS } from "@/services/todos/view";
import {
  ACTION_COLUMN_WIDTH,
  SELECT_COLUMN_WIDTH,
  DEFAULT_LIST_COLUMNS,
  LIST_COLUMNS,
  LIST_COLUMN_IDS,
  PINNED_COLUMN,
  isDefaultListColumns,
  moveListColumn,
  MIN_COLUMN_WIDTH,
  MIN_PINNED_COLUMN_WIDTH,
  normalizeListColumnWidths,
  withListColumnWidth,
  normalizeListColumns,
  offeredListColumns,
  readListColumnWidths,
  readListColumns,
  resolveListColumns,
  tableMinWidth,
  toggleListColumn,
  writeListColumnWidths,
  writeListColumns,
  type ListColumnId,
} from "./listColumns";

describe("the registry", () => {
  it("declares every id exactly once, keyed by itself", () => {
    for (const id of LIST_COLUMN_IDS) {
      expect(LIST_COLUMNS[id].id).toBe(id);
    }

    expect(new Set(LIST_COLUMN_IDS).size).toBe(LIST_COLUMN_IDS.length);
  });

  // The whole point of `sort: null` — a header may only offer sorting the
  // pipeline can actually perform, and sortTodos only knows SORT_KEYS.
  it("never names a sort key sortTodos does not have", () => {
    for (const id of LIST_COLUMN_IDS) {
      const { sort } = LIST_COLUMNS[id];

      if (sort === null) continue;

      expect(SORT_KEYS).toContain(sort);
      expect(sort).not.toBe("manual");
    }
  });

  it("makes exactly one column elastic, and it is the pinned one", () => {
    const elastic = LIST_COLUMN_IDS.filter((id) => LIST_COLUMNS[id].elastic);

    expect(elastic).toEqual([PINNED_COLUMN]);
  });

  it("opens on defaults that start with the pinned column", () => {
    expect(DEFAULT_LIST_COLUMNS[0]).toBe(PINNED_COLUMN);
    expect(isDefaultListColumns([...DEFAULT_LIST_COLUMNS])).toBe(true);
  });
});

describe("normalizeListColumns", () => {
  it("drops ids the registry no longer has", () => {
    expect(normalizeListColumns(["work", "labels", "status"])).toEqual([
      "work",
      "status",
    ]);
  });

  it("drops duplicates", () => {
    expect(normalizeListColumns(["work", "due", "due"])).toEqual([
      "work",
      "due",
    ]);
  });

  it("restores the pinned column to the front when it is missing or misplaced", () => {
    expect(normalizeListColumns(["status"])).toEqual(["work", "status"]);
    expect(normalizeListColumns(["status", "work"])).toEqual([
      "work",
      "status",
    ]);
  });

  it("survives a stored value that is not a list of strings", () => {
    expect(normalizeListColumns([null, 7, {}, "due"])).toEqual(["work", "due"]);
  });
});

describe("toggleListColumn", () => {
  it("appends a hidden column and removes a shown one", () => {
    expect(toggleListColumn(["work", "status"], "due")).toEqual([
      "work",
      "status",
      "due",
    ]);

    expect(toggleListColumn(["work", "status", "due"], "status")).toEqual([
      "work",
      "due",
    ]);
  });

  it("refuses to hide the pinned column", () => {
    expect(toggleListColumn(["work", "status"], PINNED_COLUMN)).toEqual([
      "work",
      "status",
    ]);
  });
});

describe("moveListColumn", () => {
  const columns: ListColumnId[] = ["work", "assignee", "priority", "status"];

  it("moves one column to the named side of another", () => {
    expect(moveListColumn(columns, "status", "assignee", "before")).toEqual([
      "work",
      "status",
      "assignee",
      "priority",
    ]);

    expect(moveListColumn(columns, "assignee", "status", "after")).toEqual([
      "work",
      "priority",
      "status",
      "assignee",
    ]);
  });

  it("never moves anything into or out of the pinned column's slot", () => {
    expect(
      moveListColumn(columns, "assignee", PINNED_COLUMN, "before"),
    ).toEqual(columns);
    expect(moveListColumn(columns, PINNED_COLUMN, "status", "after")).toEqual(
      columns,
    );
  });

  // Moves over the stored list, so a column the sprints flag hides keeps its
  // stored slot instead of being dropped or shuffled.
  it("leaves a stored column the sprints flag is hiding where it was", () => {
    const stored: ListColumnId[] = ["work", "sprint", "status", "due"];

    const next = moveListColumn(stored, "due", "status", "before");

    expect(next).toEqual(["work", "sprint", "due", "status"]);
    expect(
      resolveListColumns(next, { sprintsEnabled: false }).map((c) => c.id),
    ).toEqual(["work", "due", "status"]);
  });
});

describe("column widths", () => {
  it("clamps to the column's floor and drops a width equal to the default", () => {
    expect(withListColumnWidth({}, "status", 10)).toEqual({
      status: MIN_COLUMN_WIDTH,
    });
    expect(withListColumnWidth({}, "work", 10)).toEqual({
      work: MIN_PINNED_COLUMN_WIDTH,
    });
    expect(
      withListColumnWidth({ status: 300 }, "status", LIST_COLUMNS.status.width),
    ).toEqual({});
    expect(withListColumnWidth({ status: 300 }, "status", null)).toEqual({});
  });

  it("repairs whatever storage hands back", () => {
    expect(normalizeListColumnWidths("nope")).toEqual({});
    expect(
      normalizeListColumnWidths({ status: 250, bogus: 90, due: "wide" }),
    ).toEqual({ status: 250 });
  });

  it("widens the table's floor by a resized column", () => {
    const shown = resolveListColumns(["work", "status"], {
      sprintsEnabled: true,
    });

    expect(tableMinWidth(shown, { status: 400 }) - tableMinWidth(shown)).toBe(
      400 - LIST_COLUMNS.status.width,
    );
  });
});

describe("sprint gating", () => {
  it("drops the sprint column from both the table and the menu when sprints are off", () => {
    const ids: ListColumnId[] = ["work", "sprint", "status"];

    expect(
      resolveListColumns(ids, { sprintsEnabled: false }).map((c) => c.id),
    ).toEqual(["work", "status"]);

    expect(
      offeredListColumns({ sprintsEnabled: false }).map((c) => c.id),
    ).not.toContain("sprint");

    expect(
      resolveListColumns(ids, { sprintsEnabled: true }).map((c) => c.id),
    ).toEqual(ids);
  });
});

describe("tableMinWidth", () => {
  it("sums the visible tracks plus the checkbox and action columns", () => {
    const columns = resolveListColumns(["work", "status"], {
      sprintsEnabled: true,
    });

    expect(tableMinWidth(columns)).toBe(
      SELECT_COLUMN_WIDTH +
        LIST_COLUMNS.work.width +
        LIST_COLUMNS.status.width +
        ACTION_COLUMN_WIDTH,
    );
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
    writeListColumns(["work", "estimate", "sprint"]);

    expect(readListColumns()).toEqual(["work", "estimate", "sprint"]);
  });

  it("stores nothing at all for the default set", () => {
    writeListColumns([...DEFAULT_LIST_COLUMNS]);

    expect(store["list:columns"]).toBeUndefined();
    expect(readListColumns()).toEqual([...DEFAULT_LIST_COLUMNS]);
  });

  it("falls back to the defaults rather than throwing on unreadable storage", () => {
    // What a private window with site data blocked actually does: throws on
    // access rather than returning null.
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

    expect(readListColumns()).toEqual([...DEFAULT_LIST_COLUMNS]);
    expect(() => writeListColumns(["work", "due"])).not.toThrow();
  });

  it("falls back to the defaults on a corrupt entry", () => {
    store["list:columns"] = "{not json";
    expect(readListColumns()).toEqual([...DEFAULT_LIST_COLUMNS]);

    store["list:columns"] = '"work"';
    expect(readListColumns()).toEqual([...DEFAULT_LIST_COLUMNS]);
  });

  it("repairs a stored entry written by an older registry", () => {
    store["list:columns"] = JSON.stringify(["status", "labels", "status"]);

    expect(readListColumns()).toEqual(["work", "status"]);
  });

  it("keeps widths per board, starting a board from the shared ones", () => {
    store["list:column-widths"] = JSON.stringify({ status: 250 });

    expect(readListColumnWidths("board-a")).toEqual({ status: 250 });

    writeListColumnWidths({ status: 300 }, "board-a");

    expect(readListColumnWidths("board-a")).toEqual({ status: 300 });
    expect(readListColumnWidths("board-b")).toEqual({ status: 250 });
    expect(readListColumnWidths()).toEqual({ status: 250 });
  });

  it("keeps a board reset to the defaults reset, rather than falling back", () => {
    store["list:column-widths"] = JSON.stringify({ status: 250 });

    writeListColumnWidths({}, "board-a");

    expect(readListColumnWidths("board-a")).toEqual({});
  });

  it("repairs a board's stored widths and survives unreadable storage", () => {
    store["list:column-widths:board-a"] = JSON.stringify({
      status: 10,
      bogus: 90,
    });

    expect(readListColumnWidths("board-a")).toEqual({
      status: MIN_COLUMN_WIDTH,
    });

    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readListColumnWidths("board-a")).toEqual({});
    expect(() =>
      writeListColumnWidths({ status: 300 }, "board-a"),
    ).not.toThrow();
  });
});
