import type { ColumnCategory } from "@/constants/columns";
import { addDays } from "./calendar";
import { TIMELINE_WINDOW, type TimelineScale } from "./timeline";

/**
 * Planning gestures on the timeline, as arithmetic (M20-B).
 *
 * **Every rule the drag has to obey lives here, and none of it in a handler.**
 * The gestures are three — move the range, move one end, draw a new one — and
 * each is a pure `(range, input) => range`. A pointer handler that also decided
 * what a drag *means* would be the one place none of this could be tested, and
 * the invariants are not cosmetic: `todos_date_range_check` rejects `start >
 * due` outright, so a gesture that can produce an inverted range is a gesture
 * that can throw a 23514 at the user mid-drag.
 *
 * **The date arithmetic is still M19's.** `addDays` is imported from
 * `calendar.ts` for the reason `timeline.ts` records at its head — a second copy
 * is a second place a month boundary can be wrong.
 *
 * **The unit of a gesture is a column, not a pixel and not a day.** That is what
 * "snap to the timeline's boundary" means when a column is a week: at the
 * `months` scale one step right is `+7` days, so a task that began on a
 * Wednesday still begins on a Wednesday. Snapping the *start* to the week
 * boundary instead would silently shift a task by up to six days on a drag that
 * asked for one step, which is the kind of correction nobody asked for.
 *
 * Resizing is the other half of that rule and reads the opposite way: an end
 * dropped on a column takes that whole column, because the bar you released
 * over is the period you meant.
 */

/** Two inclusive `YYYY-MM-DD` days — the shape `TimelineItem` already uses. */
export interface DayRange {
  start: string;
  end: string;
}

/** Which part of a bar the pointer took hold of. */
export type DragMode = "move" | "start" | "end";

/**
 * A day as milliseconds at midnight UTC.
 *
 * The same quarantine the rest of the date code keeps: built through `Date.UTC`,
 * never read back through a local getter, never escaping as a `Date`.
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
 * The last day of the column that begins on `day`.
 *
 * One day at the `weeks` scale (so it is `day` itself) and seven at `months`.
 * This is the minimum a range drawn or resized on the timeline can be, and the
 * brief's "at least one day" is its floor rather than its value: a column is
 * the smallest thing the axis can express, so a shorter range would draw
 * identically to a one-column one while storing something else.
 */
export function columnEnd(day: string, scale: TimelineScale): string {
  return addDays(day, TIMELINE_WINDOW[scale].span - 1);
}

/**
 * Which column a pointer at `offsetX` is over, clamped into the track.
 *
 * The track is `repeat(n, minmax(min, 1fr))`, so every column is the same
 * width and the index is a division — no per-column measurement, and nothing to
 * fall out of step with the grid it is reading. Clamped rather than nulled: a
 * pointer dragged past the right edge means the last column, not "no answer".
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
 * A horizontal travel, in columns.
 *
 * Rounded, not floored, so the bar steps to the column the pointer is nearest
 * rather than the one it has fully entered — a drag of half a column plus a
 * pixel reads as one step, which is what the eye already believes happened.
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
 * The whole range, shifted. **The duration is preserved by construction** —
 * both ends move by the same number of days, so there is no length to
 * recompute and no rounding for one end to disagree with the other about.
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
 * Clamped at the end rather than allowed to cross it and be swapped: dragging
 * the left edge past the right one is a gesture that ran out of room, and a bar
 * that flips over under the pointer is a bar that then resizes the wrong way.
 * The result is a one-day range, which is the shortest thing that can be said.
 */
export function resizeStart(range: DayRange, day: string): DayRange {
  return { start: day > range.end ? range.end : day, end: range.end };
}

/** A new end, with the start left where it was. Clamped for the same reason. */
export function resizeEnd(range: DayRange, day: string): DayRange {
  return { start: range.start, end: day < range.start ? range.start : day };
}

/**
 * The range a create-drag has drawn between two columns, in either direction.
 *
 * Dragging right to left is the same range as left to right — the anchor is
 * where the gesture *began*, not where it is lower — so the two columns are
 * ordered rather than trusted. A press with no travel leaves both on the same
 * column and yields exactly one, which is the minimum and the default in one
 * expression.
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
 * **Derived from the column's category and the calendar, and stored nowhere.**
 * The brief rules out inventing a status model when one exists, and one does:
 * doneness on this board has always been "which column is it in", with no
 * second source of truth (see `types/data.ts` on why `todos.completed` was
 * dropped). So `done` is complete, `todo` has not started, and the only case
 * with anything to compute is `in_progress`, where the honest number is how far
 * through its own planned period the task is.
 *
 * That is deliberately a *time* ratio and not a claim about the work. Nothing
 * in the schema knows what fraction of a task is finished, and drawing a bar
 * that implied otherwise would be inventing data. What it does say — "this is
 * in progress and two thirds of its window is gone" — is true, useful, and
 * already on the row.
 *
 * Unknown categories fall back to `todo`, matching `categoryOf`, so a row
 * written before the category column existed reads as not started rather than
 * throwing off the fill.
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
 * **"Never invent a date", as a function rather than as a rule to remember.**
 * A task with only a due date is a *point* — the plan's own words, and
 * `timelineItems` encodes it — which means the timeline knows when it is due
 * and nothing at all about when it starts. Dragging that diamond three days
 * right says the due date moved; it does not say the task acquired a start.
 * Writing one anyway would manufacture a fact the user never gave, on a gesture
 * that did not ask for it, and it is not even reversible by dragging back.
 *
 * So a point writes the one end it has, an item with both writes both, and an
 * item with neither — the undated rows, being scheduled for the first time —
 * writes both, because drawing a range on the axis *is* the act of supplying
 * them.
 *
 * The caller passes booleans rather than a `Todo` so this stays a pure
 * statement about two absences, testable without constructing a row.
 */
export function scheduleFields(
  hasStart: boolean,
  hasEnd: boolean,
): { writeStart: boolean; writeEnd: boolean } {
  // Neither: the range is new, so both ends are the user's own answer.
  if (!hasStart && !hasEnd) return { writeStart: true, writeEnd: true };

  return { writeStart: hasStart, writeEnd: hasEnd };
}
