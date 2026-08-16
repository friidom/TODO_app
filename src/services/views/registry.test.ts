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
    expect(isViewMode("summary")).toBe(true);
    expect(isViewMode("board")).toBe(true);
    expect(isViewMode("list")).toBe(true);
    expect(isViewMode("calendar")).toBe(true);
    // Still roadmap (M20). It is listed in the tab row as an inert
    // placeholder, which is not the same as being a mode.
    expect(isViewMode("timeline")).toBe(false);
    expect(isViewMode(undefined)).toBe(false);
  });

  it("reports the board as reordering and the others as not", () => {
    expect(capabilitiesOf("board").canReorder).toBe(true);
    expect(capabilitiesOf("list").canReorder).toBe(false);
    expect(capabilitiesOf("summary").canReorder).toBe(false);
    // The calendar drags, and still does not reorder. `canReorder` means
    // "writes todos.position", not "has drag and drop" — a calendar drop
    // writes due_date through the ordinary update path.
    expect(capabilitiesOf("calendar").canReorder).toBe(false);
  });

  it("lets the Calendar neither group nor sort, because dates are its axis", () => {
    // Same gate Summary uses: `ViewToolbar` reads these two flags, so a view
    // whose order is the date axis does not offer a sort that cannot reorder
    // it, and a view whose layout IS a grouping does not offer a second one.
    expect(capabilitiesOf("calendar").canGroup).toBe(false);
    expect(capabilitiesOf("calendar").canSort).toBe(false);
  });

  it("lets both work-item views group and sort", () => {
    // Board and List have shown the same filter, sort and grouping since they
    // shipped. The registry has to keep saying so, or one of them would start
    // hiding a control the other offers.
    for (const mode of ["board", "list"] as const) {
      expect(capabilitiesOf(mode).canGroup).toBe(true);
      expect(capabilitiesOf(mode).canSort).toBe(true);
    }
  });

  it("lets Summary do neither, which is what hides its two dead controls", () => {
    // `ViewToolbar` gates Group and Sort on exactly these flags. If Summary
    // ever reports true here, two controls that change nothing reappear above
    // a dashboard — which is the state the registry exists to make impossible
    // to reach by accident.
    expect(capabilitiesOf("summary").canGroup).toBe(false);
    expect(capabilitiesOf("summary").canSort).toBe(false);
  });

  it("leads with Summary, because the tab order is this array", () => {
    expect(VIEW_MODES[0]).toBe("summary");
  });
});
