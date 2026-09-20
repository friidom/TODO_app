import type { HeatmapCell, SeriesPoint } from "./types";
import type { SeriesMetric } from "./registry";

// Never below 1, so a quiet period does not divide by zero. The same guard
// trendPeak() already uses for the board summary.
export function seriesPeak(points: SeriesPoint[], metric: SeriesMetric): number {
  return Math.max(1, ...points.map((point) => point[metric]));
}

export function barHeight(value: number, peak: number): string {
  if (value <= 0) return "0%";

  // Floored, so a bucket with one event is a visible mark rather than a gap
  // indistinguishable from nothing happening.
  return `${Math.max(3, Math.round((value / peak) * 100))}%`;
}

export interface HeatmapDay {
  date: string;
  count: number;
}

export const HEATMAP_LEVELS = 5;

// Quantiles of the observed maximum rather than fixed thresholds: one person
// finishing three tasks a day and another thirty should both produce a
// readable gradient rather than one flat block and one all-white grid.
export function heatmapLevel(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 0;

  const step = Math.ceil((count / max) * (HEATMAP_LEVELS - 1));

  return Math.min(HEATMAP_LEVELS - 1, Math.max(1, step));
}

export function heatmapMax(cells: HeatmapCell[]): number {
  return cells.reduce((highest, cell) => Math.max(highest, cell.count), 0);
}

function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

// Columns of seven, starting on the window's first day, which the server
// already aligned to a Sunday. Building the calendar here rather than on the
// server keeps the payload to the days that actually have a count.
export function heatmapWeeks(from: string, to: string, cells: HeatmapCell[]): HeatmapDay[][] {
  const counts = new Map(cells.map((cell) => [cell.date, cell.count]));
  const start = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(`${to.slice(0, 10)}T00:00:00.000Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const weeks: HeatmapDay[][] = [];
  let week: HeatmapDay[] = [];

  for (let at = start; at <= end; at = new Date(at.getTime() + 86_400_000)) {
    const date = isoDay(at);

    week.push({ date, count: counts.get(date) ?? 0 });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  if (week.length > 0) weeks.push(week);

  return weeks;
}
