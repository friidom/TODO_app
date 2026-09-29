import { beforeEach, describe, expect, it, vi } from "vitest";

import { FILTER_CATEGORIES } from "@/services/todos/view";
import { reorder } from "@/utils/reorder";
import {
  TOOLBAR_CONTROL_IDS,
  TOOLBAR_LABELS,
  isDefaultToolbarControls,
  isToolbarControl,
  normalizeToolbarControls,
  readToolbarControls,
  writeToolbarControls,
  type ToolbarControlId,
} from "./toolbar";

describe("the registry", () => {
  it("declares every id once, each with a label", () => {
    expect(new Set(TOOLBAR_CONTROL_IDS).size).toBe(TOOLBAR_CONTROL_IDS.length);

    for (const id of TOOLBAR_CONTROL_IDS) {
      expect(TOOLBAR_LABELS[id]).toBeTruthy();
    }
  });

  it("has a chip for every filter category", () => {
    for (const category of FILTER_CATEGORIES) {
      expect(isToolbarControl(category)).toBe(true);
    }
  });

  it("opens on the order search, filters, then group and sort", () => {
    expect(TOOLBAR_CONTROL_IDS[0]).toBe("search");
    expect(TOOLBAR_CONTROL_IDS.slice(-2)).toEqual(["group", "sort"]);
    expect(isDefaultToolbarControls([...TOOLBAR_CONTROL_IDS])).toBe(true);
  });
});

describe("isToolbarControl", () => {
  it("accepts only the declared ids", () => {
    expect(isToolbarControl("assignee")).toBe(true);
    expect(isToolbarControl("filter")).toBe(false);
    expect(isToolbarControl(3)).toBe(false);
    expect(isToolbarControl(null)).toBe(false);
  });
});

describe("normalizeToolbarControls", () => {
  it("keeps a complete order as it is", () => {
    const order: ToolbarControlId[] = [
      "sort",
      "group",
      "due",
      "type",
      "priority",
      "status",
      "assignee",
      "search",
    ];

    expect(normalizeToolbarControls(order)).toEqual(order);
  });

  it("drops unknown ids and duplicates", () => {
    const order = normalizeToolbarControls([
      "filter",
      "status",
      "search",
      "status",
      7,
      null,
    ]);

    expect(order.slice(0, 2)).toEqual(["status", "search"]);
    expect(new Set(order).size).toBe(order.length);
  });

  it("appends the missing ones in default order", () => {
    expect(normalizeToolbarControls(["sort", "search"])).toEqual([
      "sort",
      "search",
      "assignee",
      "status",
      "priority",
      "type",
      "due",
      "group",
    ]);
  });
});

describe("moving a control", () => {
  it("is reorder over the stored order, so a hidden control keeps its slot", () => {
    // group and sort are not rendered on Summary, so the drop is named against
    // a visible neighbour and the two hidden ids stay where they were
    const order = reorder([...TOOLBAR_CONTROL_IDS], "search", "due", "after");

    expect(order).toEqual([
      "assignee",
      "status",
      "priority",
      "type",
      "due",
      "search",
      "group",
      "sort",
    ]);
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

  it("round-trips an order", () => {
    const order = reorder([...TOOLBAR_CONTROL_IDS], "sort", "search", "before");

    writeToolbarControls(order);

    expect(readToolbarControls()).toEqual(order);
  });

  it("removes the entry once the order is back to the default", () => {
    writeToolbarControls(["sort", "search"]);
    expect(store["toolbar:controls"]).toBeDefined();

    writeToolbarControls([...TOOLBAR_CONTROL_IDS]);
    expect(store["toolbar:controls"]).toBeUndefined();
    expect(readToolbarControls()).toEqual([...TOOLBAR_CONTROL_IDS]);
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

    expect(readToolbarControls()).toEqual([...TOOLBAR_CONTROL_IDS]);
    expect(() => writeToolbarControls(["sort"])).not.toThrow();
  });

  it("falls back to the default on a corrupt entry", () => {
    store["toolbar:controls"] = "{not json";
    expect(readToolbarControls()).toEqual([...TOOLBAR_CONTROL_IDS]);

    store["toolbar:controls"] = '"search"';
    expect(readToolbarControls()).toEqual([...TOOLBAR_CONTROL_IDS]);
  });

  it("repairs an entry written before a control existed", () => {
    store["toolbar:controls"] = JSON.stringify(["due", "filter", "search"]);

    expect(readToolbarControls()).toEqual([
      "due",
      "search",
      "assignee",
      "status",
      "priority",
      "type",
      "group",
      "sort",
    ]);
  });
});
