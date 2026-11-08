import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FILTER_IDS } from "@/services/filters/registry";
import type { SpaceGroup } from "@/services/spaces/groupBoards";
import type { IBoard, ISpace } from "@/types/data";
import {
  DEFAULT_SIDEBAR_LAYOUT,
  SIDEBAR_DND,
  SIDEBAR_NAV,
  SIDEBAR_SECTIONS,
  UNFILED,
  arrangeGroups,
  moved,
  normalizeSidebarLayout,
  orderBy,
  readSidebarLayout,
  restoreDefaults,
  sidebarListOf,
  sidebarView,
  spaceKeyOf,
  toggleCollapsed,
  toggleHidden,
  withOrder,
  writeSidebarLayout,
  type SidebarLayout,
} from "./layout";

const board = (id: string) => ({ id, title: id }) as IBoard;
const space = (id: string) => ({ id, title: id }) as ISpace;

const groups: SpaceGroup[] = [
  { space: space("s1"), owned: true, boards: [board("b1"), board("b2")] },
  { space: space("s2"), owned: true, boards: [board("b3")] },
  { space: null, owned: true, boards: [board("b4"), board("b5")] },
];

const hiding = (...hidden: string[]): SidebarLayout => ({
  ...DEFAULT_SIDEBAR_LAYOUT,
  hidden,
});

const keysOf = (list: SpaceGroup[]) => list.map(spaceKeyOf);
const boardsOf = (group: SpaceGroup | undefined) =>
  group?.boards.map((it) => it.id);

describe("normalizeSidebarLayout", () => {
  it("falls back to the default for anything that is not a layout", () => {
    for (const raw of [null, "spaces", 42, ["spaces"]]) {
      expect(normalizeSidebarLayout(raw)).toEqual(DEFAULT_SIDEBAR_LAYOUT);
    }
  });

  it("keeps a saved section, filter and nav order, and appends ones added since", () => {
    const layout = normalizeSidebarLayout({
      sections: ["filters"],
      filters: ["done-work", "my-open"],
      nav: ["notifications", "for-you"],
    });

    expect(layout.sections).toEqual(["filters", "spaces"]);
    expect(layout.filters.slice(0, 2)).toEqual(["done-work", "my-open"]);
    expect([...layout.filters].sort()).toEqual([...FILTER_IDS].sort());
    expect(layout.nav).toEqual([
      "notifications",
      "for-you",
      "recent",
      "starred",
      "admin",
    ]);
  });

  it("drops unknown sections, nav items and filters, duplicates and non-string ids", () => {
    const layout = normalizeSidebarLayout({
      sections: ["spaces", "spaces", "recent", 7],
      nav: ["recent", "apps", "recent"],
      spaces: ["a", "a", 3, null, "b"],
      boards: { a: ["x", 1, "x", "y"], b: "not a list" },
      filters: ["nope", "my-open", "my-open"],
      collapsed: ["filters", 9],
      hidden: ["b1", "b1", 4, "recent"],
    });

    expect(layout.sections).toEqual(["spaces", "filters"]);
    expect(layout.nav[0]).toBe("recent");
    expect([...layout.nav].sort()).toEqual([...SIDEBAR_NAV].sort());
    expect(layout.spaces).toEqual(["a", "b"]);
    expect(layout.boards).toEqual({ a: ["x", "y"], b: [] });
    expect(layout.filters.filter((id) => id === "my-open")).toHaveLength(1);
    expect(layout.collapsed).toEqual(["filters"]);
    expect(layout.hidden).toEqual(["b1", "recent"]);
  });

  it("keeps filters collapsed by default when nothing was saved about it", () => {
    expect(normalizeSidebarLayout({}).collapsed).toEqual(["filters"]);
    expect(normalizeSidebarLayout({ collapsed: [] }).collapsed).toEqual([]);
  });

  it("reads a layout saved before customising existed as hiding nothing", () => {
    const layout = normalizeSidebarLayout({ sections: ["filters", "spaces"] });

    expect(layout.hidden).toEqual([]);
    expect(layout.nav).toEqual([...SIDEBAR_NAV]);
  });
});

it("never lets nav, section and filter ids collide, so hidden can be one list", () => {
  const ids = [...SIDEBAR_NAV, ...SIDEBAR_SECTIONS, ...FILTER_IDS, UNFILED];

  expect(new Set(ids).size).toBe(ids.length);
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
  it("orders spaces and each space's boards, and keeps Unfiled last", () => {
    const arranged = arrangeGroups(groups, {
      ...DEFAULT_SIDEBAR_LAYOUT,
      spaces: ["s2", "s1"],
      boards: { s1: ["b2"], unfiled: ["b5"] },
    });

    expect(keysOf(arranged)).toEqual(["s2", "s1", "unfiled"]);
    expect(boardsOf(arranged[1])).toEqual(["b2", "b1"]);
    expect(boardsOf(arranged[2])).toEqual(["b5", "b4"]);
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

describe("toggleHidden and restoreDefaults", () => {
  it("hides an id once and shows it again the second time", () => {
    const hidden = toggleHidden(DEFAULT_SIDEBAR_LAYOUT, "b1");

    expect(hidden.hidden).toEqual(["b1"]);
    expect(toggleHidden(hidden, "b1").hidden).toEqual([]);
  });

  it("restores order and visibility, but not which sections are open", () => {
    const custom: SidebarLayout = {
      ...DEFAULT_SIDEBAR_LAYOUT,
      nav: ["notifications", "for-you", "recent", "starred", "admin"],
      sections: ["filters", "spaces"],
      spaces: ["s2", "s1"],
      hidden: ["recent", "s1"],
      collapsed: ["s2"],
    };

    expect(restoreDefaults(custom)).toEqual({
      ...DEFAULT_SIDEBAR_LAYOUT,
      collapsed: ["s2"],
    });
  });
});

describe("moves", () => {
  it("maps a drag group back to its list", () => {
    expect(sidebarListOf(SIDEBAR_DND.board)).toBe("board");
    expect(sidebarListOf("list-columns")).toBeUndefined();
  });

  it("keeps a hidden board's slot when a shown one moves past it", () => {
    const three: SpaceGroup[] = [
      {
        space: space("s1"),
        owned: true,
        boards: [board("b1"), board("b2"), board("b6")],
      },
    ];

    const layout = moved(hiding("b2"), three, "board", {
      activeId: "b6",
      overId: "b1",
      side: "before",
      container: "s1",
    });

    expect(layout.boards.s1).toEqual(["b6", "b1", "b2"]);
  });

  it("keeps a nav order complete when the reader never saw Superadmin", () => {
    const layout = withOrder(DEFAULT_SIDEBAR_LAYOUT, "nav", [
      "notifications",
      "for-you",
      "recent",
      "starred",
    ]);

    expect(layout.nav).toEqual([
      "notifications",
      "for-you",
      "recent",
      "starred",
      "admin",
    ]);
  });

  it("leaves the layout alone for a board move with no space to move in", () => {
    expect(withOrder(DEFAULT_SIDEBAR_LAYOUT, "board", ["b1"])).toBe(
      DEFAULT_SIDEBAR_LAYOUT,
    );
  });
});

describe("sidebarView", () => {
  it("shows everything by default and leaves More empty", () => {
    const view = sidebarView(DEFAULT_SIDEBAR_LAYOUT, groups, true);

    expect(view.nav).toEqual([...SIDEBAR_NAV]);
    expect(view.sections).toEqual([...SIDEBAR_SECTIONS]);
    expect(keysOf(view.groups)).toEqual(["s1", "s2", "unfiled"]);
    expect(view.groups.every((group) => group.away === 0)).toBe(true);
    expect(view.filters).toEqual([...FILTER_IDS]);
    expect(view.more).toEqual({ nav: [], groups: [], filters: [] });
  });

  it("keeps Superadmin out of everyone else's sidebar and More alike", () => {
    expect(sidebarView(DEFAULT_SIDEBAR_LAYOUT, groups, false).nav).toEqual([
      "for-you",
      "recent",
      "starred",
      "notifications",
    ]);
    expect(sidebarView(hiding("admin"), groups, false).more.nav).toEqual([]);
    expect(sidebarView(hiding("admin"), groups, true).more.nav).toEqual([
      "admin",
    ]);
  });

  it("moves a hidden board into More under its space, and counts it on the space it left", () => {
    const view = sidebarView(hiding("b2"), groups, true);

    expect(boardsOf(view.groups[0])).toEqual(["b1"]);
    expect(view.groups[0]?.away).toBe(1);
    expect(keysOf(view.more.groups)).toEqual(["s1"]);
    expect(boardsOf(view.more.groups[0])).toEqual(["b2"]);
  });

  it("takes a hidden space's boards along, and every space along with the section", () => {
    const one = sidebarView(hiding("s1"), groups, true);

    expect(keysOf(one.groups)).toEqual(["s2", "unfiled"]);
    expect(boardsOf(one.more.groups[0])).toEqual(["b1", "b2"]);

    const section = sidebarView(hiding("spaces"), groups, true);

    expect(section.sections).toEqual(["filters"]);
    expect(section.groups).toEqual([]);
    expect(keysOf(section.more.groups)).toEqual(["s1", "s2", "unfiled"]);
  });

  it("takes every filter along with the Filters section", () => {
    const one = sidebarView(hiding("my-open"), groups, true);

    expect(one.filters).not.toContain("my-open");
    expect(one.more.filters).toEqual(["my-open"]);

    const section = sidebarView(hiding("filters"), groups, true);

    expect(section.sections).toEqual(["spaces"]);
    expect(section.filters).toEqual([]);
    expect(section.more.filters).toEqual([...FILTER_IDS]);
  });

  it("puts nothing in More for a hidden space with no boards", () => {
    const empty: SpaceGroup[] = [
      { space: space("s3"), owned: true, boards: [] },
    ];

    expect(sidebarView(hiding("s3"), empty, true).more.groups).toEqual([]);
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a layout per user", () => {
    const layout: SidebarLayout = {
      ...DEFAULT_SIDEBAR_LAYOUT,
      sections: ["filters", "spaces"],
      spaces: ["s2"],
      boards: { s2: ["b3"] },
      collapsed: [],
      hidden: ["b3", "recent"],
    };

    writeSidebarLayout("u1", layout);

    expect(readSidebarLayout("u1")).toEqual(layout);
    expect(readSidebarLayout("u2")).toEqual(DEFAULT_SIDEBAR_LAYOUT);
  });

  it("starts from the device-wide layout of before, until someone saves", () => {
    store["sidebar:layout"] = JSON.stringify({ sections: ["filters"] });

    expect(readSidebarLayout("u1").sections).toEqual(["filters", "spaces"]);

    writeSidebarLayout("u1", readSidebarLayout("u1"));

    expect(store["sidebar:layout"]).toBeUndefined();
    expect(readSidebarLayout("u2")).toEqual(DEFAULT_SIDEBAR_LAYOUT);
  });

  it("falls back to the default on a corrupt entry", () => {
    store["sidebar:layout:u1"] = "{not json";

    expect(readSidebarLayout("u1")).toEqual(DEFAULT_SIDEBAR_LAYOUT);
  });

  it("falls back to the default rather than throwing on blocked storage", () => {
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

    expect(readSidebarLayout("u1")).toEqual(DEFAULT_SIDEBAR_LAYOUT);
    expect(() =>
      writeSidebarLayout("u1", DEFAULT_SIDEBAR_LAYOUT),
    ).not.toThrow();
  });
});
