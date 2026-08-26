import type { ColumnCategory } from "@/constants/columns";
import { addDays } from "./calendar";
import { TIMELINE_WINDOW, type TimelineScale } from "./timeline";

/**
 * Planning gestures on the timeline, as arithmetic.
 *
 * Every rule the drag obeys lives here, none of it in a handler. The three
 * gestures — move the range, move one end, draw a new one — are each a pure
 * `(range, input) => range`. This matters beyond testability:
 * todos_date_range_check rejects `start > due` outright, so a gesture that can
 * produce an inverted range is one that can throw a 23514 mid-drag.
 *
 * `addDays` comes from calendar.ts rather than being reimplemented — a second
 * copy is a second place a month boundary can be wrong.
 *
 * The unit of a gesture is a column, not a pixel and not a day. At the `months`
 * scale one step right is +7 days, so a task that began on a Wednesday still
 * begins on a Wednesday; snapping the start to the week boundary instead would
 * shift it by up to six days on a drag that asked for one step. Resizing reads
 * the opposite way: an end dropped on a column takes that whole column, because
 * the bar you released over is the period you meant.
 */

/** Two inclusive `YYYY-MM-DD` days — the shape `TimelineItem` already uses. */
export interface DayRange {
  start: string;
  end: string;
}

/** Which part of a bar the pointer took hold of. */
export type DragMode = "move" | "start" | "end";

/**
 * A day as milliseconds at midnight UTC. Built through `Date.UTC`, never read
 * back through a local getter, never escaping as a `Date`.
 */
function utcMs(day: string): number {
  const [year, month, date] = day.split("-").map(Number);

  return Date.UTC(year, month - 1, date);
}

/** Whole days from `from` to `to`. Positive when `to` is the later day. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / 86_400_000);
}

/** How many days a range covers, counting both ends. Always at least 1. */
export function rangeLength(range: DayRange): number {
  return Math.max(1, daysBetween(range.start, range.end) + 1);
}

/**
 * The last day of the column that begins on `day` — itself at `weeks`, six days
 * later at `months`.
 *
 * This is the floor for a range drawn or resized here: a column is the smallest
 * thing the axis can express, so a shorter range would draw identically to a
 * one-column one while storing something else.
 */
export function columnEnd(day: string, scale: TimelineScale): string {
  return addDays(day, TIMELINE_WINDOW[scale].span - 1);
}

/**
 * Which column a pointer at `offsetX` is over, clamped into the track.
 *
 * The track is `repeat(n, minmax(min, 1fr))`, so every column is the same width
 * and the index is a division — nothing per-column to measure and fall out of
 * step with. Clamped rather than nulled: past the right edge means the last
 * column, not "no answer".
 */
export function tickAtOffset(
  offsetX: number,
  trackWidth: number,
  tickCount: number,
): number {
  if (tickCount <= 0 || trackWidth <= 0) return 0;

  const index = Math.floor((offsetX / trackWidth) * tickCount);

  return Math.min(tickCount - 1, Math.max(0, index));
}

/**
 * A horizontal travel, in columns. Rounded rather than floored, so the bar steps
 * to the column the pointer is nearest — half a column plus a pixel reads as one
 * step, which is what the eye already believes happened.
 */
export function ticksMoved(
  deltaX: number,
  trackWidth: number,
  tickCount: number,
): number {
  if (tickCount <= 0 || trackWidth <= 0) return 0;

  return Math.round(deltaX / (trackWidth / tickCount));
}

/**
 * The whole range, shifted. Duration is preserved by construction: both ends
 * move by the same number of days, so there's no length to recompute and no
 * rounding for one end to disagree with the other about.
 */
export function moveRange(range: DayRange, deltaDays: number): DayRange {
  if (deltaDays === 0) return range;

  return {
    start: addDays(range.start, deltaDays),
    end: addDays(range.end, deltaDays),
  };
}

/**
 * A new start, with the end left where it was.
 *
 * Clamped at the end rather than allowed to cross and swap: dragging the left
 * edge past the right one is a gesture that ran out of room, and a bar that
 * flips under the pointer then resizes the wrong way. The result is a one-day
 * range, the shortest thing that can be said.
 */
export function resizeStart(range: DayRange, day: string): DayRange {
  return { start: day > range.end ? range.end : day, end: range.end };
}

/** A new end, with the start left where it was. Clamped for the same reason. */
export function resizeEnd(range: DayRange, day: string): DayRange {
  return { start: range.start, end: day < range.start ? range.start : day };
}

/**
 * The range a create-drag drew between two columns, in either direction.
 *
 * The anchor is where the gesture began, not where it's lower, so the two
 * columns are ordered rather than trusted. A press with no travel leaves both on
 * the same column and yields exactly one day.
 */
export function draftRange(
  anchorTick: number,
  pointerTick: number,
  ticks: string[],
  scale: TimelineScale,
): DayRange | null {
  if (ticks.length === 0) return null;

  const limit = ticks.length - 1;
  const a = Math.min(limit, Math.max(0, anchorTick));
  const b = Math.min(limit, Math.max(0, pointerTick));

  return {
    start: ticks[Math.min(a, b)],
    end: columnEnd(ticks[Math.max(a, b)], scale),
  };
}

/**
 * How much of a range is behind us, as 0–1 — the bar's progress fill.
 *
 * Derived from the column's category and the calendar, stored nowhere. Doneness
 * on this board has always been "which column is it in" (see types/data.ts on
 * why todos.completed was dropped), so `done` is complete, `todo` hasn't
 * started, and only `in_progress` has anything to compute.
 *
 * That number is a *time* ratio, not a claim about the work. Nothing in the
 * schema knows what fraction of a task is finished, and a bar implying otherwise
 * would be inventing data. "In progress, two thirds of its window gone" is true
 * and already on the row.
 *
 * Unknown categories fall back to `todo`, matching categoryOf.
 */
export function progressRatio(
  category: string | null | undefined,
  range: DayRange,
  today: string,
): number {
  if (category === ("done" satisfies ColumnCategory)) return 1;

  if (category !== ("in_progress" satisfies ColumnCategory)) return 0;

  const total = rangeLength(range);
  const elapsed = daysBetween(range.start, today) + 1;

  return Math.min(1, Math.max(0, elapsed / total));
}

/**
 * Which of the two date columns a gesture on this item may write.
 *
 * "Never invent a date", as a function rather than a rule to remember. A task
 * with only a due date is a point: the timeline knows when it's due and nothing
 * about when it starts. Dragging that diamond says the due date moved, not that
 * the task acquired a start — writing one would manufacture a fact the user
 * never gave, on a gesture that didn't ask for it, and dragging back wouldn't
 * undo it.
 *
 * So a point writes the one end it has, an item with both writes both, and an
 * undated row writes both, because drawing a range on the axis *is* supplying
 * them.
 *
 * Takes booleans rather than a Todo so it stays a pure statement about two
 * absences, testable without constructing a row.
 */
export function scheduleFields(
  hasStart: boolean,
  hasEnd: boolean,
): { writeStart: boolean; writeEnd: boolean } {
  // Neither: the range is new, so both ends are the user's own answer.
  if (!hasStart && !hasEnd) return { writeStart: true, writeEnd: true };

  return { writeStart: hasStart, writeEnd: hasEnd };
}
