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

export function tickAtOffset(
  offsetX: number,
  trackWidth: number,
  tickCount: number,
): number {
  if (tickCount <= 0 || trackWidth <= 0) return 0;

  const index = Math.floor((offsetX / trackWidth) * tickCount);

  return Math.min(tickCount - 1, Math.max(0, index));
}

// rounded, not floored, so the bar snaps to the nearest column under the pointer
export function ticksMoved(
  deltaX: number,
  trackWidth: number,
  tickCount: number,
): number {
  if (tickCount <= 0 || trackWidth <= 0) return 0;

  return Math.round(deltaX / (trackWidth / tickCount));
}

export function moveRange(range: DayRange, deltaDays: number): DayRange {
  if (deltaDays === 0) return range;

  return {
    start: addDays(range.start, deltaDays),
    end: addDays(range.end, deltaDays),
  };
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

  if (category !== ("in_progress" satisfies ColumnCategory)) return 0;

  const total = rangeLength(range);
  const elapsed = daysBetween(range.start, today) + 1;

  return Math.min(1, Math.max(0, elapsed / total));
}

// never invent a date the user didn't give — a point (only one date set) only writes that one end
export function scheduleFields(
  hasStart: boolean,
  hasEnd: boolean,
): { writeStart: boolean; writeEnd: boolean } {
  if (!hasStart && !hasEnd) return { writeStart: true, writeEnd: true };

  return { writeStart: hasStart, writeEnd: hasEnd };
}
