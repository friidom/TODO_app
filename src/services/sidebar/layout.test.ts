import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FILTER_IDS } from "@/services/filters/registry";
import type { SpaceGroup } from "@/services/spaces/groupBoards";
import type { IBoard, ISpace } from "@/types/data";
import {
  DEFAULT_SIDEBAR_LAYOUT,
  arrangeGroups,
  normalizeSidebarLayout,
  orderBy,
  readSidebarLayout,
  toggleCollapsed,
  writeSidebarLayout,
} from "./layout";

const board = (id: string) => ({ id, title: id }) as IBoard;
const space = (id: string) => ({ id, title: id }) as ISpace;

describe("normalizeSidebarLayout", () => {
  it("falls back to the default for anything that is not a layout", () => {
    for (const raw of [null, "spaces", 42, ["spaces"]]) {
      expect(normalizeSidebarLayout(raw)).toEqual(DEFAULT_SIDEBAR_LAYOUT);
    }
  });

  it("keeps a saved section and filter order, and appends ones added since", () => {
    const layout = normalizeSidebarLayout({
      sections: ["filters"],
      filters: ["done-work", "my-open"],
    });

    expect(layout.sections).toEqual(["filters", "spaces"]);
    expect(layout.filters.slice(0, 2)).toEqual(["done-work", "my-open"]);
    expect([...layout.filters].sort()).toEqual([...FILTER_IDS].sort());
  });

  it("drops unknown sections and filters, duplicates and non-string ids", () => {
    const layout = normalizeSidebarLayout({
      sections: ["spaces", "spaces", "recent", 7],
      spaces: ["a", "a", 3, null, "b"],
      boards: { a: ["x", 1, "x", "y"], b: "not a list" },
      filters: ["nope", "my-open", "my-open"],
      collapsed: ["filters", 9],
    });

    expect(layout.sections).toEqual(["spaces", "filters"]);
    expect(layout.spaces).toEqual(["a", "b"]);
    expect(layout.boards).toEqual({ a: ["x", "y"], b: [] });
    expect(layout.filters.filter((id) => id === "my-open")).toHaveLength(1);
    expect(layout.collapsed).toEqual(["filters"]);
  });

  it("keeps filters collapsed by default when nothing was saved about it", () => {
    expect(normalizeSidebarLayout({}).collapsed).toEqual(["filters"]);
    expect(normalizeSidebarLayout({ collapsed: [] }).collapsed).toEqual([]);
  });
});

describe("orderBy", () => {
  const items = ["a", "b", "c", "d"];

  it("puts saved ids first and keeps the arrival order for the rest", () => {
    expect(orderBy(items, ["c", "a"], (it) => it)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("ignores saved ids that no longer exist", () => {
    expect(orderBy(items, ["gone", "d"], (it) => it)).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });

  it("returns a copy in arrival order when nothing was saved", () => {
    const result = orderBy(items, undefined, (it) => it);

    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });
});

describe("arrangeGroups", () => {
  const groups: SpaceGroup[] = [
    { space: space("s1"), boards: [board("b1"), board("b2")] },
    { space: space("s2"), boards: [board("b3")] },
    { space: null, boards: [board("b4"), board("b5")] },
  ];

  it("orders spaces and each space's boards, and keeps Unfiled last", () => {
    const arranged = arrangeGroups(groups, {
      ...DEFAULT_SIDEBAR_LAYOUT,
      spaces: ["s2", "s1"],
      boards: { s1: ["b2"], unfiled: ["b5"] },
    });

    expect(arranged.map((group) => group.space?.id ?? "unfiled")).toEqual([
      "s2",
      "s1",
      "unfiled",
    ]);
    expect(arranged[1]!.boards.map((it) => it.id)).toEqual(["b2", "b1"]);
    expect(arranged[2]!.boards.map((it) => it.id)).toEqual(["b5", "b4"]);
  });
});

describe("toggleCollapsed", () => {
  it("adds a key once and removes it the second time", () => {
    const closed = toggleCollapsed(
      { ...DEFAULT_SIDEBAR_LAYOUT, collapsed: [] },
      "s1",
    );

    expect(closed.collapsed).toEqual(["s1"]);
    expect(toggleCollapsed(closed, "s1").collapsed).toEqual([]);
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
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a layout", () => {
    const layout = {
      ...DEFAULT_SIDEBAR_LAYOUT,
      sections: ["filters" as const, "spaces" as const],
      spaces: ["s2"],
      boards: { s2: ["b3"] },
      collapsed: [],
    };

    writeSidebarLayout(layout);

    expect(readSidebarLayout()).toEqual(layout);
  });

  it("falls back to the default on a corrupt entry", () => {
    store["sidebar:layout"] = "{not json";

    expect(readSidebarLayout()).toEqual(DEFAULT_SIDEBAR_LAYOUT);
  });

  it("falls back to the default rather than throwing on blocked storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readSidebarLayout()).toEqual(DEFAULT_SIDEBAR_LAYOUT);
    expect(() => writeSidebarLayout(DEFAULT_SIDEBAR_LAYOUT)).not.toThrow();
  });
});
