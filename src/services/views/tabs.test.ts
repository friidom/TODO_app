import { beforeEach, describe, expect, it, vi } from "vitest";

import { VIEW_MODES, type ViewMode } from "./registry";
import {
  TAB_LABEL_MAX,
  defaultViewOf,
  hiddenTabs,
  hideTab,
  isDefaultTabs,
  moveTab,
  normalizeTabs,
  parseDefaultViews,
  readDefaultViews,
  renameTab,
  showTab,
  shownTabs,
  tabLabel,
  withDefaultView,
  writeDefaultViews,
  type ViewTab,
} from "./tabs";

const modes = (tabs: readonly ViewTab[]) => tabs.map((tab) => tab.mode);

const DEFAULT = normalizeTabs(null);

describe("normalizeTabs", () => {
  it("gives the registry's views in order when nothing is stored", () => {
    expect(modes(DEFAULT)).toEqual([...VIEW_MODES]);
    expect(DEFAULT.every((tab) => tab.label === null && !tab.hidden)).toBe(
      true,
    );
  });

  it("keeps the stored order and appends what it lacks in registry order", () => {
    const tabs = normalizeTabs([
      { mode: "list", label: null, hidden: false },
      { mode: "timeline", label: null, hidden: false },
    ]);

    expect(modes(tabs)).toEqual([
      "list",
      "timeline",
      "summary",
      "board",
      "calendar",
      "backlog",
    ]);
  });

  it("drops unknown modes, duplicates and entries that are not objects", () => {
    const tabs = normalizeTabs([
      { mode: "roadmap", label: null, hidden: false },
      { mode: "list", label: "First", hidden: false },
      { mode: "list", label: "Second", hidden: true },
      "calendar",
      null,
    ]);

    expect(modes(tabs)[0]).toBe("list");
    expect(tabs[0]).toEqual({ mode: "list", label: "First", hidden: false });
    expect(modes(tabs)).toHaveLength(VIEW_MODES.length);
    expect(new Set(modes(tabs)).size).toBe(VIEW_MODES.length);
  });

  it("treats a value that is not an array as the default set", () => {
    expect(normalizeTabs({ mode: "list" })).toEqual(DEFAULT);
    expect(normalizeTabs(undefined)).toEqual(DEFAULT);
  });

  it("trims and caps labels, and nulls an empty or built-in one", () => {
    const tabs = normalizeTabs([
      { mode: "list", label: "  Everything  ", hidden: false },
      { mode: "summary", label: "   ", hidden: false },
      { mode: "calendar", label: "Calendar", hidden: false },
      { mode: "timeline", label: "x".repeat(60), hidden: false },
      { mode: "backlog", label: 7, hidden: false },
    ]);

    expect(tabs.map((tab) => tab.label)).toEqual([
      "Everything",
      null,
      null,
      "x".repeat(TAB_LABEL_MAX),
      null,
      null,
    ]);
  });

  it("never hides Board, which BoardPage falls back to", () => {
    const tabs = normalizeTabs([{ mode: "board", label: null, hidden: true }]);

    expect(tabs.find((tab) => tab.mode === "board")?.hidden).toBe(false);
  });

  it("reads hidden only when it is literally true", () => {
    const tabs = normalizeTabs([{ mode: "list", label: null, hidden: "yes" }]);

    expect(tabs[0]?.hidden).toBe(false);
  });
});

describe("isDefaultTabs", () => {
  it("is true for the repaired empty set and false after any change", () => {
    expect(isDefaultTabs(DEFAULT)).toBe(true);
    expect(isDefaultTabs(moveTab(DEFAULT, "list", "summary", "before"))).toBe(
      false,
    );
    expect(isDefaultTabs(renameTab(DEFAULT, "list", "Rows"))).toBe(false);
    expect(isDefaultTabs(hideTab(DEFAULT, "list"))).toBe(false);
  });

  it("is true again once a change is undone", () => {
    const renamed = renameTab(DEFAULT, "list", "Rows");

    expect(isDefaultTabs(renameTab(renamed, "list", null))).toBe(true);
    expect(isDefaultTabs(renameTab(renamed, "list", "List"))).toBe(true);
  });
});

describe("tabLabel", () => {
  it("prefers the board's name for a tab and falls back to the registry's", () => {
    const tabs = renameTab(DEFAULT, "list", "Rows");

    expect(tabLabel(tabs.find((tab) => tab.mode === "list")!)).toBe("Rows");
    expect(tabLabel(tabs.find((tab) => tab.mode === "board")!)).toBe("Board");
  });
});

describe("shownTabs and hiddenTabs", () => {
  const hidden = hideTab(hideTab(DEFAULT, "calendar"), "backlog");

  it("leaves hidden tabs out", () => {
    expect(
      modes(shownTabs(hidden, { sprintsEnabled: true, current: "board" })),
    ).toEqual(["summary", "board", "list", "timeline"]);
  });

  it("keeps a hidden tab while it is the open view", () => {
    expect(
      modes(shownTabs(hidden, { sprintsEnabled: true, current: "calendar" })),
    ).toContain("calendar");
  });

  it("drops Backlog with sprints off, even when it is open", () => {
    expect(
      modes(shownTabs(DEFAULT, { sprintsEnabled: false, current: "backlog" })),
    ).not.toContain("backlog");
  });

  it("offers hidden tabs to re-add, except Backlog with sprints off", () => {
    expect(modes(hiddenTabs(hidden, { sprintsEnabled: true }))).toEqual([
      "calendar",
      "backlog",
    ]);
    expect(modes(hiddenTabs(hidden, { sprintsEnabled: false }))).toEqual([
      "calendar",
    ]);
  });
});

describe("moveTab", () => {
  it("moves a tab before or after another", () => {
    expect(modes(moveTab(DEFAULT, "list", "summary", "before"))).toEqual([
      "list",
      "summary",
      "board",
      "calendar",
      "timeline",
      "backlog",
    ]);
    expect(modes(moveTab(DEFAULT, "summary", "backlog", "after"))).toEqual([
      "board",
      "list",
      "calendar",
      "timeline",
      "backlog",
      "summary",
    ]);
  });

  it("carries the tab's label and hidden flag with it", () => {
    const renamed = renameTab(DEFAULT, "list", "Rows");
    const moved = moveTab(renamed, "list", "summary", "before");

    expect(moved[0]).toEqual({ mode: "list", label: "Rows", hidden: false });
  });

  it("leaves hidden tabs in their slots around a move", () => {
    const tabs = hideTab(DEFAULT, "calendar");

    expect(modes(moveTab(tabs, "summary", "timeline", "before"))).toEqual([
      "board",
      "list",
      "calendar",
      "summary",
      "timeline",
      "backlog",
    ]);
  });

  it("does not mutate its input", () => {
    const input = normalizeTabs(null);

    moveTab(input, "list", "summary", "before");

    expect(input).toEqual(DEFAULT);
  });
});

describe("renameTab", () => {
  it("renames one tab and resets it with null or blank", () => {
    const renamed = renameTab(DEFAULT, "list", " Rows ");

    expect(renamed.find((tab) => tab.mode === "list")?.label).toBe("Rows");
    expect(
      renameTab(renamed, "list", "").find((tab) => tab.mode === "list")?.label,
    ).toBeNull();
  });
});

describe("hideTab and showTab", () => {
  it("refuses to hide Board", () => {
    expect(hideTab(DEFAULT, "board")).toEqual(DEFAULT);
  });

  it("shows a hidden tab again at the end", () => {
    const tabs = showTab(hideTab(DEFAULT, "list"), "list");

    expect(modes(tabs).at(-1)).toBe("list");
    expect(tabs.at(-1)?.hidden).toBe(false);
  });

  it("does not move a tab that was not hidden", () => {
    expect(showTab(DEFAULT, "list")).toEqual(DEFAULT);
  });
});

describe("default views", () => {
  const BOARD = "11111111-1111-4111-8111-111111111111";

  it("answers Board for a board with no entry, no board, or a junk entry", () => {
    expect(defaultViewOf({}, BOARD)).toBe("board");
    expect(defaultViewOf({ [BOARD]: "list" }, undefined)).toBe("board");
    expect(defaultViewOf({}, "constructor")).toBe("board");
    expect(defaultViewOf({ [BOARD]: "roadmap" as ViewMode }, BOARD)).toBe(
      "board",
    );
  });

  it("stores a choice and removes the entry when it is Board again", () => {
    const views = withDefaultView({}, BOARD, "list");

    expect(defaultViewOf(views, BOARD)).toBe("list");
    expect(withDefaultView(views, BOARD, "board")).toEqual({});
  });

  it("repairs what it parses", () => {
    expect(
      parseDefaultViews({ a: "list", b: "roadmap", c: "board", d: 4 }),
    ).toEqual({ a: "list" });
    expect(parseDefaultViews(["list"])).toEqual({});
    expect(parseDefaultViews(null)).toEqual({});
  });
});

describe("default view storage", () => {
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

  it("round-trips a map and clears the key when it is empty", () => {
    writeDefaultViews({ a: "summary" });

    expect(readDefaultViews()).toEqual({ a: "summary" });

    writeDefaultViews({});

    expect(Object.keys(store)).toEqual([]);
  });

  it("reads corrupt JSON as no defaults", () => {
    store["board:default-view"] = "{not json";

    expect(readDefaultViews()).toEqual({});
  });

  it("survives a storage that throws", () => {
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

    expect(readDefaultViews()).toEqual({});
    expect(() => writeDefaultViews({ a: "list" })).not.toThrow();
  });
});
