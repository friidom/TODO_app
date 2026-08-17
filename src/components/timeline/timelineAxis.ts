import type { TimelineScale } from "@/services/views/timeline";

/**
 * The timeline's fixed measurements, in one place (M20).
 *
 * Same reason `listGrid.ts` exists: the header, the rows and the today marker
 * all have to agree about where the axis starts and how wide a column is, and
 * three components each holding their own copy of `15rem` is three chances for
 * the header to stop lining up with the bars underneath it.
 *
 * Named `timelineAxis` rather than `timelineGrid` because TypeScript treats
 * `timelineGrid.ts` and `TimelineGrid.tsx` as the same module on a
 * case-insensitive filesystem, and refuses the program outright (TS1149).
 */

/** The row label column. `w-60` is this value — keep the two in step. */
export const RAIL_WIDTH = "15rem";

/**
 * The narrowest a column may be before the track starts scrolling sideways.
 *
 * A minimum rather than a fixed width: the track is `1fr` per column, so on a
 * wide screen the columns stretch to fill and on a narrow one they hold this
 * size and the whole grid scrolls as one. Nothing reflows either way.
 *
 * The week scale draws a day per column and the month scale a week, so the
 * month scale can afford more room per column while covering four times the
 * period.
 */
export const TICK_MIN: Record<TimelineScale, string> = {
  weeks: "1.75rem",
  months: "2.5rem",
};

/**
 * The height of the two stacked header rows, in pixels.
 *
 * Needed as a number rather than a class because the background grid is
 * absolutely positioned and has to start *below* the header instead of drawing
 * through it. `h-6` + `h-7` = 24 + 28.
 */
export const HEADER_HEIGHT = 52;

/**
 * One row, 36px — `h-9`, and the two must stay in step.
 *
 * Down from 44px in the polish pass. A timeline row carries a key, a title and
 * a bar; it has none of the list row's controls, so the list's height bought
 * nothing but distance between one bar and the next. Twelve rows now fit where
 * ten did, which is most of what makes the view read as a chart rather than as
 * a table with markers in it.
 */
export const ROW_HEIGHT = "h-9";

/** `repeat(n, minmax(min, 1fr))` — the track's columns, for an inline style. */
export function trackColumns(count: number, scale: TimelineScale): string {
  return `repeat(${count}, minmax(${TICK_MIN[scale]}, 1fr))`;
}

/** The width the scroller must give its content before it starts scrolling. */
export function trackMinWidth(count: number, scale: TimelineScale): string {
  return `calc(${RAIL_WIDTH} + ${count} * ${TICK_MIN[scale]})`;
}
