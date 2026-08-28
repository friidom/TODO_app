import { describe, expect, it } from "vitest";

import {
  VIEWS,
  VIEW_MODES,
  capabilitiesOf,
  isViewMode,
  reorderingViews,
} from "./registry";

describe("view registry", () => {
  it("ONLY VIEWS WITH THEIR OWN FRACTIONAL-RANK FIELD MAY REORDER", () => {
    // Not a style rule. `todos.position`/`rank` is one field, and two views
    // renumbering it from two stale snapshots would silently lose one of
    // them — the entire reason the fractional-rank migration (M6-A) exists.
    //
    // Board and Backlog are both `true` here, and that is not a regression
    // of the guard: they order two separate fields (`rank` and
    // `backlog_rank`), so neither can renumber the other's from a stale
    // snapshot. If this fails because a *third* view starts reordering,
    // check first whether it has its own rank field the way Backlog does —
    // if not, the fix is a new one, not a larger array here.
    expect(reorderingViews()).toEqual(["board", "backlog"]);
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
    expect(isViewMode("timeline")).toBe(true);
    expect(isViewMode("backlog")).toBe(true);
    // Not a view. The tab row is driven by this array, so a name that is not
    // in it cannot be reached by hand-editing `?view=` either.
    expect(isViewMode("gantt")).toBe(false);
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
    // The timeline drags as of M20-B — a bar moves, its ends resize, and a
    // sweep across empty track creates — and it still does not reorder, for
    // the same reason the calendar does not: every one of those gestures
    // writes `start_date`/`due_date` and none writes `position`. Its row order
    // is derived from the dates at render, so there is no stored order for a
    // drag to disagree with.
    expect(capabilitiesOf("timeline").canReorder).toBe(false);
    // The Backlog view reorders since M31-C, writing its own `backlog_rank`
    // — a separate field from the Board's `rank`, so this is not the two
    // views-one-field hazard the guard above exists to catch.
    expect(capabilitiesOf("backlog").canReorder).toBe(true);
  });

  it("lets neither date view group nor sort, because time is their axis", () => {
    // Same gate Summary uses: `ViewToolbar` reads these two flags, so a view
    // whose order is the date axis does not offer a sort that cannot reorder
    // it, and a view whose layout IS a grouping does not offer a second one.
    for (const mode of ["calendar", "timeline"] as const) {
      expect(capabilitiesOf(mode).canGroup).toBe(false);
      expect(capabilitiesOf(mode).canSort).toBe(false);
    }
  });

  it("lets the Backlog view do neither — its grouping by Sprint is the layout", () => {
    expect(capabilitiesOf("backlog").canGroup).toBe(false);
    expect(capabilitiesOf("backlog").canSort).toBe(false);
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
