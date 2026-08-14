import { describe, expect, it } from "vitest";

import {
  VIEWS,
  VIEW_MODES,
  capabilitiesOf,
  isViewMode,
  reorderingViews,
} from "./registry";

describe("view registry", () => {
  it("EXACTLY ONE VIEW MAY WRITE STORED ORDER UNTIL M6-A LANDS", () => {
    // Not a style rule. `todos.position` is a dense integer and a reorder
    // renumbers a whole column from the client's snapshot, so two views that
    // both write order will silently lose one of them — which is the entire
    // reason the fractional-rank migration (M6-A) exists.
    //
    // If this fails because a new view legitimately reorders, the fix is M6-A,
    // not a larger number here.
    expect(reorderingViews()).toEqual(["board"]);
  });

  it("gives every mode a definition, keyed by its own mode", () => {
    for (const mode of VIEW_MODES) {
      expect(VIEWS[mode].mode).toBe(mode);
      expect(VIEWS[mode].label).toBeTruthy();
    }
  });

  it("recognises its own modes and nothing else", () => {
    expect(isViewMode("board")).toBe(true);
    expect(isViewMode("list")).toBe(true);
    expect(isViewMode("calendar")).toBe(false);
    expect(isViewMode(undefined)).toBe(false);
  });

  it("reports the board as reordering and the list as not", () => {
    expect(capabilitiesOf("board").canReorder).toBe(true);
    expect(capabilitiesOf("list").canReorder).toBe(false);
  });

  it("lets both current views group and sort", () => {
    // Board and List have shown the same filter, sort and grouping since they
    // shipped. The registry has to keep saying so, or one of them would start
    // hiding a control the other offers.
    for (const mode of VIEW_MODES) {
      expect(capabilitiesOf(mode).canGroup).toBe(true);
      expect(capabilitiesOf(mode).canSort).toBe(true);
    }
  });
});
