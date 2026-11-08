import type { ColumnCategory } from "@/constants/columns";
import { addDays } from "./calendar";
import { TIMELINE_WINDOW, type TimelineScale } from "./timeline";

// pure arithmetic for the three drag gestures (move/resize/draw) — db rejects start > due, so these must never produce an inverted range

export interface DayRange {
  start: string;
  end: string;
}

export type DragMode = "move" | "start" | "end";

function utcMs(day: string): number {
  const [year, month, date] = day.split("-").map(Number);

  return Date.UTC(year, month - 1, date);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / 86_400_000);
}

export function rangeLength(range: DayRange): number {
  return Math.max(1, daysBetween(range.start, range.end) + 1);
}

export function columnEnd(day: string, scale: TimelineScale): string {
  return addDays(day, TIMELINE_WINDOW[scale].span - 1);
}

export function indexAtOffset(
  offsetX: number,
  trackWidth: number,
  count: number,
): number {
  if (count <= 0 || trackWidth <= 0) return 0;

  const index = Math.floor((offsetX / trackWidth) * count);

  return Math.min(count - 1, Math.max(0, index));
}

// rounded, not floored, so the bar snaps to the nearest slice under the pointer
export function stepsMoved(
  deltaX: number,
  trackWidth: number,
  count: number,
): number {
  if (count <= 0 || trackWidth <= 0) return 0;

  return Math.round(deltaX / (trackWidth / count));
}

export function moveRange(range: DayRange, deltaDays: number): DayRange {
  if (deltaDays === 0) return range;

  return {
    start: addDays(range.start, deltaDays),
    end: addDays(range.end, deltaDays),
  };
}

// Either side may be open. Comparing YYYY-MM-DD strings is comparing days.
export interface DayBounds {
  start: string | null;
  end: string | null;
}

export const UNBOUNDED: DayBounds = { start: null, end: null };

// bounds: where the range must stay (its parent's own dates).
// contain: what it must keep covering (its children with dates of their own).
export interface DragLimits {
  bounds: DayBounds;
  contain: DayRange | null;
}

export const NO_LIMITS: DragLimits = { bounds: UNBOUNDED, contain: null };

// A range longer than its parent cannot be made to fit by moving it, so it
// moves freely and the row says it is out of bounds instead.
export function constrainMove(
  base: DayRange,
  deltaDays: number,
  { bounds }: DragLimits,
): DayRange {
  const moved = moveRange(base, deltaDays);
  const length = daysBetween(base.start, base.end);

  if (
    bounds.start !== null &&
    bounds.end !== null &&
    length > daysBetween(bounds.start, bounds.end)
  ) {
    return moved;
  }

  if (bounds.start !== null && moved.start < bounds.start) {
    return { start: bounds.start, end: addDays(bounds.start, length) };
  }

  if (bounds.end !== null && moved.end > bounds.end) {
    return { start: addDays(bounds.end, -length), end: bounds.end };
  }

  return moved;
}

export function constrainStart(
  base: DayRange,
  day: string,
  { bounds, contain }: DragLimits,
): DayRange {
  let start = bounds.start !== null && day < bounds.start ? bounds.start : day;
  const limit =
    contain !== null && contain.start < base.end ? contain.start : base.end;

  if (start > limit) start = limit;

  return { start, end: base.end };
}

export function constrainEnd(
  base: DayRange,
  day: string,
  { bounds, contain }: DragLimits,
): DayRange {
  let end = bounds.end !== null && day > bounds.end ? bounds.end : day;
  const limit =
    contain !== null && contain.end > base.start ? contain.end : base.start;

  if (end < limit) end = limit;

  return { start: base.start, end };
}

export function constrainDraw(
  range: DayRange,
  { bounds }: DragLimits,
): DayRange {
  const clampDay = (day: string) =>
    bounds.start !== null && day < bounds.start
      ? bounds.start
      : bounds.end !== null && day > bounds.end
        ? bounds.end
        : day;

  const start = clampDay(range.start);
  const end = clampDay(range.end);

  return { start, end: end < start ? start : end };
}

// clamped at the other end rather than allowed to cross — dragging past it collapses to a one-day range instead of flipping
export function resizeStart(range: DayRange, day: string): DayRange {
  return { start: day > range.end ? range.end : day, end: range.end };
}

export function resizeEnd(range: DayRange, day: string): DayRange {
  return { start: range.start, end: day < range.start ? range.start : day };
}

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

// time elapsed in the window, not task progress — nothing in the schema knows how much work is actually done
export function progressRatio(
  category: string | null | undefined,
  range: DayRange,
  today: string,
): number {
  if (category === ("done" satisfies ColumnCategory)) return 1;

  if (
    category !== ("in_progress" satisfies ColumnCategory) &&
    category !== ("in_review" satisfies ColumnCategory)
  ) {
    return 0;
  }

  const total = rangeLength(range);
  const elapsed = daysBetween(range.start, today) + 1;

  return Math.min(1, Math.max(0, elapsed / total));
}
