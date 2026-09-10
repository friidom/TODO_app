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
    // board and backlog each write a separate field (rank vs backlog_rank) — a third reordering view needs its own field too, not just a spot in this array
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
    expect(isViewMode("gantt")).toBe(false);
    expect(isViewMode(undefined)).toBe(false);
  });

  it("reports the board as reordering and the others as not", () => {
    expect(capabilitiesOf("board").canReorder).toBe(true);
    expect(capabilitiesOf("list").canReorder).toBe(false);
    expect(capabilitiesOf("summary").canReorder).toBe(false);
    // canReorder means "writes todos.position", not "has drag and drop" — calendar/timeline drags write dates instead
    expect(capabilitiesOf("calendar").canReorder).toBe(false);
    expect(capabilitiesOf("timeline").canReorder).toBe(false);
    expect(capabilitiesOf("backlog").canReorder).toBe(true);
  });

  it("lets neither date view group nor sort, because time is their axis", () => {
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
    for (const mode of ["board", "list"] as const) {
      expect(capabilitiesOf(mode).canGroup).toBe(true);
      expect(capabilitiesOf(mode).canSort).toBe(true);
    }
  });

  it("lets Summary do neither, which is what hides its two dead controls", () => {
    expect(capabilitiesOf("summary").canGroup).toBe(false);
    expect(capabilitiesOf("summary").canSort).toBe(false);
  });

  it("leads with Summary, because the tab order is this array", () => {
    expect(VIEW_MODES[0]).toBe("summary");
  });
});
