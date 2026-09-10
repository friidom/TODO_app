import type { TimelineScale } from "@/services/views/timeline";

// named timelineAxis, not timelineGrid, because TS treats that and TimelineGrid.tsx as the same module on a case-insensitive filesystem (TS1149)

// var, not a literal — this only ever lands in inline styles, which can't carry a breakpoint, so it has to read the CSS var declared in global.css
export const RAIL_WIDTH = "var(--timeline-rail)";

export const TICK_MIN: Record<TimelineScale, string> = {
  weeks: "1.75rem",
  months: "2.5rem",
};

// as a number, not a class — the background grid is absolutely positioned and needs to start below the header
export const HEADER_HEIGHT = 52;

export const ROW_HEIGHT = "h-9";

export function trackColumns(count: number, scale: TimelineScale): string {
  return `repeat(${count}, minmax(${TICK_MIN[scale]}, 1fr))`;
}

export function trackMinWidth(count: number, scale: TimelineScale): string {
  return `calc(${RAIL_WIDTH} + ${count} * ${TICK_MIN[scale]})`;
}
