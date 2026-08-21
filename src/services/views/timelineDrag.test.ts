import { describe, expect, it } from "vitest";

import type { Todo } from "@/types/data";
import { fromCalendarDay } from "@/utils/dueDate";
import {
  timelineItems,
  unscheduledTodos,
  type TimelineScale,
} from "./timeline";
import {
  columnEnd,
  daysBetween,
  draftRange,
  moveRange,
  progressRatio,
  rangeLength,
  resizeEnd,
  resizeStart,
  scheduleFields,
  tickAtOffset,
  ticksMoved,
  type DayRange,
} from "./timelineDrag";

/** A track 420px wide over 42 day-columns — 10px each, so the sums are legible. */
const WEEK_TRACK = { width: 420, ticks: 42 };

function range(start: string, end: string): DayRange {
  return { start, end };
}

/** The columns a `weeks` window starting on this Monday actually holds. */
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
    column_id: "c-1",
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
    expect(tickAtOffset(0, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(0);
    // 10px per column, so 35px is a third of the way into the fourth.
    expect(tickAtOffset(35, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(3);
    expect(tickAtOffset(419, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(41);
  });

  it("CLAMPS rather than answering off the track", () => {
    // A drag past either edge means the last column it can reach, not "no
    // answer" — a gesture that leaves the window must still be committable.
    expect(tickAtOffset(-200, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(0);
    expect(tickAtOffset(9_999, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(41);
  });

  it("survives a track that has not been laid out yet", () => {
    // A measurement taken before the grid has width would otherwise divide by
    // zero and place every bar at NaN.
    expect(tickAtOffset(50, 0, 42)).toBe(0);
    expect(ticksMoved(50, 0, 42)).toBe(0);
  });

  it("measures travel in whole columns, rounding to the nearest", () => {
    expect(ticksMoved(30, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(3);
    // Half a column plus a pixel reads as one step: the bar goes where the eye
    // already believes it went.
    expect(ticksMoved(6, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(1);
    expect(ticksMoved(4, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(0);
    expect(ticksMoved(-30, WEEK_TRACK.width, WEEK_TRACK.ticks)).toBe(-3);
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
    // The two places naive day arithmetic breaks. February 2028 has 29 days.
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

    // Identity, not merely equality: nothing downstream should re-render for a
    // gesture that moved no columns.
    expect(moveRange(before, 0)).toBe(before);
  });

  it("steps a whole week per column at the month scale", () => {
    // The scale's span is applied by the caller; this is the arithmetic it
    // relies on. A Friday task still starts on a Friday.
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
  // `todos_date_range_check` rejects an inverted range outright, so a gesture
  // that could produce one is a gesture that throws 23514 at the user mid-drag.
  // Both directions clamp to the shortest thing that can be said instead.

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
    // `start = due` is a one-day task and the CHECK permits equality — the
    // most common shape a small task takes.
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
    // The anchor is where the gesture began, not where it is lower.
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
    // Done is done: a task finished early does not show as three-quarters.
    expect(progressRatio("done", august, "2026-08-02")).toBe(1);
    expect(progressRatio("done", august, "2026-09-30")).toBe(1);
  });

  it("fills IN PROGRESS by how much of its window has passed", () => {
    // Ten days, five elapsed including today.
    expect(progressRatio("in_progress", august, "2026-08-05")).toBeCloseTo(0.5);
    expect(progressRatio("in_progress", august, "2026-08-01")).toBeCloseTo(0.1);
  });

  it("clamps in progress outside its own window", () => {
    // Not started yet, and overdue. Neither is a negative or a 140% bar.
    expect(progressRatio("in_progress", august, "2026-07-01")).toBe(0);
    expect(progressRatio("in_progress", august, "2026-09-30")).toBe(1);
  });

  it("treats an unknown category as planned, exactly as categoryOf does", () => {
    // A row written before the category column existed still renders; it does
    // not throw and it does not claim progress.
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

describe("which dates a gesture may write", () => {
  it("writes BOTH for an item that has both", () => {
    expect(scheduleFields(true, true)).toEqual({
      writeStart: true,
      writeEnd: true,
    });
  });

  it("writes BOTH for an undated item being scheduled for the first time", () => {
    // Drawing a range on the axis IS the act of supplying them, so neither is
    // being invented.
    expect(scheduleFields(false, false)).toEqual({
      writeStart: true,
      writeEnd: true,
    });
  });

  it("NEVER INVENTS the missing half of a point", () => {
    // A task with only a due date knows nothing about when it starts. Dragging
    // the diamond says the due date moved; it does not say a start appeared.
    expect(scheduleFields(false, true)).toEqual({
      writeStart: false,
      writeEnd: true,
    });

    expect(scheduleFields(true, false)).toEqual({
      writeStart: true,
      writeEnd: false,
    });
  });
});

describe("a task with no dates", () => {
  it("stays off the axis and in the undated list", () => {
    const bare = todo();
    const dated = todo({
      start_date: fromCalendarDay("2026-08-21"),
      due_date: fromCalendarDay("2026-08-30"),
    });

    expect(timelineItems([bare, dated])).toHaveLength(1);
    expect(unscheduledTodos([bare, dated])).toEqual([bare]);
  });

  it("is not given dates by being drawn on — the write is what schedules it", () => {
    const bare = todo();

    // The gesture produces a range; the row is untouched until it is committed.
    draftRange(4, 8, weekTicks("2026-08-17"), "weeks");

    expect(bare.start_date).toBeNull();
    expect(bare.due_date).toBeNull();
  });
});

describe("persistence", () => {
  /**
   * The round trip a reload actually makes: a range becomes the two stored
   * instants, the board query hands those back, and `timelineItems` places the
   * bar again. Anything lost in `fromCalendarDay` / `toCalendarDay` — a
   * timezone applied on one side and not the other — moves the bar by a day
   * here, which is the bug this convention exists to prevent.
   */
  function reload(planned: DayRange) {
    const [item] = timelineItems([
      todo({
        start_date: fromCalendarDay(planned.start),
        due_date: fromCalendarDay(planned.end),
      }),
    ]);

    return { start: item.start, end: item.end, isPoint: item.isPoint };
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
    // The distinction is how much is known, not how wide the result is — a
    // task drawn on one column has a real, deliberate span of one day.
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
