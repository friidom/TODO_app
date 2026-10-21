import { describe, expect, it } from "vitest";

import type { Todo } from "@/types/data";
import { fromCalendarDay } from "@/utils/dueDate";
import type { TimelineScale } from "./timeline";
import {
  NO_LIMITS,
  columnEnd,
  constrainDraw,
  constrainEnd,
  constrainMove,
  constrainStart,
  daysBetween,
  draftRange,
  moveRange,
  progressRatio,
  rangeLength,
  resizeEnd,
  resizeStart,
  indexAtOffset,
  stepsMoved,
  type DayRange,
  type DragLimits,
} from "./timelineDrag";
import { buildTimelineHierarchy } from "./timelineHierarchy";

// 420px over 42 day-columns — 10px each, so the sums are legible.
const WEEK_TRACK = { width: 420, ticks: 42 };

function range(start: string, end: string): DayRange {
  return { start, end };
}

function weekTicks(first: string, count = 42): string[] {
  return Array.from({ length: count }, (_, i) => {
    const ms = Date.UTC(
      Number(first.slice(0, 4)),
      Number(first.slice(5, 7)) - 1,
      Number(first.slice(8, 10)) + i,
    );

    return new Date(ms).toISOString().slice(0, 10);
  });
}

let seq = 0;

function todo(over: Partial<Todo> = {}): Todo {
  seq += 1;

  return {
    id: `t-${seq}`,
    board_id: "b-1",
    status_id: "s-1",
    board_key: seq,
    title: `Item ${seq}`,
    type: "Task",
    priority: null,
    start_date: null,
    due_date: null,
    assignee_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: null,
    ...over,
  } as Todo;
}

describe("snapping a pointer to the axis", () => {
  it("puts a pointer in the column it is over", () => {
    expect(indexAtOffset(0, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(0);
    expect(indexAtOffset(35, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(3);
    expect(indexAtOffset(419, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(41);
  });

  it("CLAMPS rather than answering off the track", () => {
    expect(indexAtOffset(-200, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(0);
    expect(indexAtOffset(9_999, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(41);
  });

  it("survives a track that has not been laid out yet", () => {
    // width 0 would otherwise divide by zero and place every bar at NaN
    expect(indexAtOffset(50, 0, 42)).toBe(0);
    expect(stepsMoved(50, 0, 42)).toBe(0);
  });

  it("measures travel in whole columns, rounding to the nearest", () => {
    expect(stepsMoved(30, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(3);
    expect(stepsMoved(6, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(1);
    expect(stepsMoved(4, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(0);
    expect(stepsMoved(-30, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(-3);
  });

  it("resolves a pointer to a DAY on a week-wide column, not to the column's Monday", () => {
    // 26 week columns over 1820px: 70px a column, 10px a day
    const days = 26 * 7;

    expect(indexAtOffset(35, 1820, 26)).toBe(0);
    expect(indexAtOffset(35, 1820, days)).toBe(3);
    expect(stepsMoved(21, 1820, days)).toBe(2);
  });

  it("makes a column one day at the week scale and a week at the month scale", () => {
    expect(columnEnd("2026-08-24", "weeks")).toBe("2026-08-24");
    expect(columnEnd("2026-08-24", "months")).toBe("2026-08-30");
  });
});

describe("moving a bar", () => {
  it("PRESERVES THE DURATION", () => {
    const before = range("2026-08-21", "2026-08-30");
    const after = moveRange(before, 3);

    expect(after).toEqual({ start: "2026-08-24", end: "2026-09-02" });
    expect(rangeLength(after)).toBe(rangeLength(before));
  });

  it("preserves it across a month boundary and a leap day", () => {
    const across = moveRange(range("2026-08-28", "2026-09-04"), 5);

    expect(across).toEqual({ start: "2026-09-02", end: "2026-09-09" });
    expect(rangeLength(across)).toBe(8);

    const leap = moveRange(range("2028-02-26", "2028-03-02"), 2);

    expect(leap).toEqual({ start: "2028-02-28", end: "2028-03-04" });
    expect(rangeLength(leap)).toBe(6);
  });

  it("preserves it going backwards, and is exactly reversible", () => {
    const before = range("2026-08-21", "2026-08-30");

    expect(moveRange(moveRange(before, 7), -7)).toEqual(before);
    expect(rangeLength(moveRange(before, -40))).toBe(10);
  });

  it("does nothing at all for a drag that ended where it started", () => {
    const before = range("2026-08-21", "2026-08-30");

    expect(moveRange(before, 0)).toBe(before);
  });

  it("steps a whole week per column at the month scale", () => {
    const after = moveRange(range("2026-08-21", "2026-08-28"), 1 * 7);

    expect(after).toEqual({ start: "2026-08-28", end: "2026-09-04" });
  });
});

describe("resizing", () => {
  it("moves the START and leaves the end alone", () => {
    const after = resizeStart(range("2026-08-21", "2026-08-30"), "2026-08-17");

    expect(after).toEqual({ start: "2026-08-17", end: "2026-08-30" });
  });

  it("moves the END and leaves the start alone", () => {
    const after = resizeEnd(range("2026-08-21", "2026-08-30"), "2026-09-04");

    expect(after).toEqual({ start: "2026-08-21", end: "2026-09-04" });
  });

  it("changes the duration, unlike a move", () => {
    const before = range("2026-08-21", "2026-08-30");

    expect(rangeLength(resizeStart(before, "2026-08-17"))).toBe(14);
    expect(rangeLength(resizeEnd(before, "2026-09-04"))).toBe(15);
  });
});

describe("start can never exceed end", () => {
  it("clamps a start dragged past the end", () => {
    const after = resizeStart(range("2026-08-21", "2026-08-30"), "2026-09-15");

    expect(after).toEqual({ start: "2026-08-30", end: "2026-08-30" });
    expect(after.start <= after.end).toBe(true);
  });

  it("clamps an end dragged past the start", () => {
    const after = resizeEnd(range("2026-08-21", "2026-08-30"), "2026-08-01");

    expect(after).toEqual({ start: "2026-08-21", end: "2026-08-21" });
    expect(after.start <= after.end).toBe(true);
  });

  it("never inverts, wherever either end is dropped", () => {
    const base = range("2026-08-21", "2026-08-30");
    const days = weekTicks("2026-08-01", 60);

    for (const day of days) {
      expect(resizeStart(base, day).start <= base.end).toBe(true);
      expect(resizeEnd(base, day).end >= base.start).toBe(true);
    }
  });

  it("allows a one-day range, which the constraint does too", () => {
    expect(resizeEnd(range("2026-08-21", "2026-08-30"), "2026-08-21")).toEqual({
      start: "2026-08-21",
      end: "2026-08-21",
    });
  });
});

describe("drawing a new range", () => {
  const ticks = weekTicks("2026-08-17");

  it("creates the range between the two columns swept", () => {
    expect(draftRange(4, 8, ticks, "weeks")).toEqual({
      start: "2026-08-21",
      end: "2026-08-25",
    });
  });

  it("reads the same swept RIGHT TO LEFT", () => {
    expect(draftRange(8, 4, ticks, "weeks")).toEqual(
      draftRange(4, 8, ticks, "weeks"),
    );
  });

  it("gives a click ONE COLUMN — the minimum and the default at once", () => {
    const clicked = draftRange(4, 4, ticks, "weeks");

    expect(clicked).toEqual({ start: "2026-08-21", end: "2026-08-21" });
    expect(rangeLength(clicked!)).toBe(1);
  });

  it("makes that one column a whole week at the month scale", () => {
    const monthly = weekTicks("2026-08-17", 26).filter((_, i) => i % 7 === 0);
    const clicked = draftRange(1, 1, monthly, "months");

    expect(clicked).toEqual({ start: "2026-08-24", end: "2026-08-30" });
    expect(rangeLength(clicked!)).toBe(7);
  });

  it("never produces a range shorter than a column, wherever it is swept", () => {
    for (const scale of ["weeks", "months"] as TimelineScale[]) {
      for (let a = 0; a < 12; a += 1) {
        for (let b = 0; b < 12; b += 1) {
          const drawn = draftRange(a, b, ticks, scale)!;

          expect(drawn.start <= drawn.end).toBe(true);
          expect(rangeLength(drawn)).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("clamps a sweep that ran off the track", () => {
    expect(draftRange(-5, 99, ticks, "weeks")).toEqual({
      start: ticks[0],
      end: ticks[41],
    });
  });

  it("has nothing to draw on an axis with no columns", () => {
    expect(draftRange(0, 0, [], "weeks")).toBeNull();
  });
});

describe("status visualization", () => {
  const august = range("2026-08-01", "2026-08-10");

  it("fills nothing for PLANNED work", () => {
    expect(progressRatio("todo", august, "2026-08-05")).toBe(0);
  });

  it("fills completely for DONE work, whatever the dates say", () => {
    expect(progressRatio("done", august, "2026-08-02")).toBe(1);
    expect(progressRatio("done", august, "2026-09-30")).toBe(1);
  });

  it("fills IN PROGRESS by how much of its window has passed", () => {
    expect(progressRatio("in_progress", august, "2026-08-05")).toBeCloseTo(0.5);
    expect(progressRatio("in_progress", august, "2026-08-01")).toBeCloseTo(0.1);
  });

  it("clamps in progress outside its own window", () => {
    expect(progressRatio("in_progress", august, "2026-07-01")).toBe(0);
    expect(progressRatio("in_progress", august, "2026-09-30")).toBe(1);
  });

  it("treats an unknown category as planned, exactly as categoryOf does", () => {
    expect(progressRatio(null, august, "2026-08-05")).toBe(0);
    expect(progressRatio(undefined, august, "2026-08-05")).toBe(0);
    expect(progressRatio("archived", august, "2026-08-05")).toBe(0);
  });

  it("handles a one-day task without dividing by zero", () => {
    const day = range("2026-08-05", "2026-08-05");

    expect(progressRatio("in_progress", day, "2026-08-05")).toBe(1);
    expect(progressRatio("in_progress", day, "2026-08-04")).toBe(0);
  });
});

describe("a task with no dates", () => {
  it("stays off the axis as a row with no range", () => {
    const [bare, dated] = buildTimelineHierarchy([
      todo({ type: "Epic" }),
      todo({
        type: "Epic",
        start_date: fromCalendarDay("2026-08-21"),
        due_date: fromCalendarDay("2026-08-30"),
      }),
    ]).epics;

    expect(bare.range).toBeNull();
    expect(bare.source).toBe("none");
    expect(dated.range).toEqual({ start: "2026-08-21", end: "2026-08-30" });
  });

  it("is not given dates by being drawn on — the write is what schedules it", () => {
    const bare = todo();

    draftRange(4, 8, weekTicks("2026-08-17"), "weeks");

    expect(bare.start_date).toBeNull();
    expect(bare.due_date).toBeNull();
  });
});

describe("drag limits", () => {
  const parent: DragLimits = {
    bounds: { start: "2026-10-01", end: "2026-10-12" },
    contain: null,
  };

  it("moves freely with nothing above it", () => {
    expect(
      constrainMove(range("2026-10-02", "2026-10-04"), 30, NO_LIMITS),
    ).toEqual(range("2026-11-01", "2026-11-03"));
  });

  it("stops a moved child at its parent's edges, keeping its length", () => {
    const child = range("2026-10-02", "2026-10-04");

    expect(constrainMove(child, 20, parent)).toEqual(
      range("2026-10-10", "2026-10-12"),
    );
    expect(constrainMove(child, -9, parent)).toEqual(
      range("2026-10-01", "2026-10-03"),
    );
  });

  it("lets a child longer than its parent move rather than trap it", () => {
    const wide = range("2026-09-25", "2026-10-20");

    expect(constrainMove(wide, 2, parent)).toEqual(
      range("2026-09-27", "2026-10-22"),
    );
  });

  it("stops a resized child at its parent's edges", () => {
    const child = range("2026-10-04", "2026-10-06");

    expect(constrainStart(child, "2026-09-20", parent)).toEqual(
      range("2026-10-01", "2026-10-06"),
    );
    expect(constrainEnd(child, "2026-10-30", parent)).toEqual(
      range("2026-10-04", "2026-10-12"),
    );
  });

  it("never inverts a range, however far a handle is dragged", () => {
    const child = range("2026-10-04", "2026-10-06");

    expect(constrainStart(child, "2026-10-09", NO_LIMITS)).toEqual(
      range("2026-10-06", "2026-10-06"),
    );
    expect(constrainEnd(child, "2026-10-01", NO_LIMITS)).toEqual(
      range("2026-10-04", "2026-10-04"),
    );
  });

  it("stops a parent's edge at the children that have dates of their own", () => {
    const epic = range("2026-10-01", "2026-10-31");
    const holding: DragLimits = {
      bounds: { start: null, end: null },
      contain: range("2026-10-05", "2026-10-20"),
    };

    expect(constrainStart(epic, "2026-10-15", holding)).toEqual(
      range("2026-10-05", "2026-10-31"),
    );
    expect(constrainEnd(epic, "2026-10-10", holding)).toEqual(
      range("2026-10-01", "2026-10-20"),
    );
    expect(constrainEnd(epic, "2026-11-10", holding)).toEqual(
      range("2026-10-01", "2026-11-10"),
    );
  });

  it("clips a drawn range to the parent, and collapses rather than inverts", () => {
    expect(constrainDraw(range("2026-09-28", "2026-10-03"), parent)).toEqual(
      range("2026-10-01", "2026-10-03"),
    );
    expect(constrainDraw(range("2026-10-20", "2026-10-25"), parent)).toEqual(
      range("2026-10-12", "2026-10-12"),
    );
  });

  it("honours a parent that bounds only one side", () => {
    const dueOnly: DragLimits = {
      bounds: { start: null, end: "2026-10-12" },
      contain: null,
    };

    expect(
      constrainMove(range("2026-10-08", "2026-10-10"), 5, dueOnly),
    ).toEqual(range("2026-10-10", "2026-10-12"));
    expect(
      constrainMove(range("2026-10-08", "2026-10-10"), -40, dueOnly),
    ).toEqual(range("2026-08-29", "2026-08-31"));
  });
});

describe("persistence", () => {
  // round trips through fromCalendarDay/toCalendarDay — a timezone slip on one side moves the bar by a day
  function reload(planned: DayRange) {
    const [node] = buildTimelineHierarchy([
      todo({
        type: "Epic",
        start_date: fromCalendarDay(planned.start),
        due_date: fromCalendarDay(planned.end),
      }),
    ]).epics;

    return {
      start: node.range?.start,
      end: node.range?.end,
      isPoint: node.source === "point",
    };
  }

  it("puts a created task back at the range it was drawn on", () => {
    const drawn = draftRange(4, 8, weekTicks("2026-08-17"), "weeks")!;

    expect(reload(drawn)).toEqual({
      start: "2026-08-21",
      end: "2026-08-25",
      isPoint: false,
    });
  });

  it("puts a moved task back at the range it was moved to", () => {
    const moved = moveRange(range("2026-08-21", "2026-08-30"), 3);

    expect(reload(moved)).toMatchObject({
      start: "2026-08-24",
      end: "2026-09-02",
    });
  });

  it("puts a resized task back at both of its new ends", () => {
    const base = range("2026-08-21", "2026-08-30");

    expect(reload(resizeStart(base, "2026-08-17"))).toMatchObject({
      start: "2026-08-17",
      end: "2026-08-30",
    });

    expect(reload(resizeEnd(base, "2026-09-04"))).toMatchObject({
      start: "2026-08-21",
      end: "2026-09-04",
    });
  });

  it("round-trips a one-day range as a range, not a point", () => {
    expect(reload(range("2026-08-21", "2026-08-21"))).toEqual({
      start: "2026-08-21",
      end: "2026-08-21",
      isPoint: false,
    });
  });

  it("round-trips every day of a year without drifting", () => {
    for (const day of weekTicks("2026-01-01", 365)) {
      expect(reload(range(day, day)).start).toBe(day);
    }
  });
});

describe("daysBetween", () => {
  it("counts forwards, backwards and across a leap day", () => {
    expect(daysBetween("2026-08-21", "2026-08-24")).toBe(3);
    expect(daysBetween("2026-08-24", "2026-08-21")).toBe(-3);
    expect(daysBetween("2026-08-21", "2026-08-21")).toBe(0);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
  });
});
