import type { CSSProperties } from "react";

import type { TimelineScale } from "@/services/views/timeline";

// named timelineAxis, not timelineGrid, because TS treats that and TimelineGrid.tsx as the same module on a case-insensitive filesystem (TS1149)

// var, not a literal — this only ever lands in inline styles, which can't carry a breakpoint, so it has to read the CSS var declared in global.css
export const RAIL_WIDTH = "var(--timeline-rail)";

export const TICK_MIN: Record<TimelineScale, string> = {
  weeks: "1.75rem",
  months: "2.5rem",
  quarters: "1.25rem",
};

// Below this a band's label switches to its short form instead of truncating.
export const TICK_MIN_PX: Record<TimelineScale, number> = {
  weeks: 28,
  months: 40,
  quarters: 20,
};

// as a number, not a class — the background grid is absolutely positioned and needs to start below the header
export const HEADER_HEIGHT = 52;

export const ROW_HEIGHT = "h-10";

// opaque because it is sticky over the axis; --tl-hover is ROW_HOVER's wash pre-mixed to a solid, so a hovered row reads as one band
export const RAIL =
  "border-(--list-line) bg-(--list-row) group-hover:bg-(--tl-hover) sticky left-0 z-10 flex w-(--timeline-rail) shrink-0 border-r transition-colors";

export const ROW_HOVER = "hover:bg-ink/5";

export const WORK_CELL = "w-[min(var(--tl-work),10rem)] md:w-(--tl-work)";

export const SIDE_CELL =
  "border-(--list-line) hidden shrink-0 items-center border-l px-2 md:flex";

export function trackMinWidth(count: number, scale: TimelineScale): string {
  return `calc(${RAIL_WIDTH} + ${count} * ${TICK_MIN[scale]})`;
}

// a plain fraction of the track, which holds because every column is the same width
export function spanStyle(
  from: number,
  to: number,
  total: number,
): CSSProperties {
  return {
    left: `${(from / total) * 100}%`,
    width: `${((to - from) / total) * 100}%`,
  };
}
