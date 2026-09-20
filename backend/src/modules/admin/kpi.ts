import { windowDays, type AdminPeriod, type PeriodRange } from "./periods.js";

// The three kinds of number M34 keeps apart, in one type so a caller cannot
// confuse them: `completed_points` is factual, `target_points` is configured,
// and `performance` is one divided by the other. Both inputs travel beside
// the ratio so the UI can always show its working, and `unestimated` travels
// beside the points so a figure never quietly omits the work nobody sized.
export interface Performance {
  target_points: number | null;
  performance: number | null;
}

// D-16, in one place. A daily target answers for "today"; every longer window
// scales the WEEKLY figure by how much of it has elapsed, so a quarter's
// target grows through the quarter rather than reading as failure on day two.
//
// Null in, null out — and null is the honest answer, never 0%. A user nobody
// has classified has no target, and a zero would be a claim about them that
// nothing supports (D-8, D-12).
export function targetFor(
  period: AdminPeriod,
  range: Pick<PeriodRange, "from" | "to">,
  daily: number | null,
  weekly: number | null,
): number | null {
  if (period === "1d") return daily;

  if (weekly === null) return null;

  return round(weekly * (windowDays(range) / 7));
}

export function performanceOf(points: number, target: number | null): number | null {
  if (target === null) return null;

  // A target of zero says "this level is not measured on points". Dividing by
  // it would produce Infinity, which renders as a number and means nothing.
  if (target === 0) return null;

  return round((points / target) * 100);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
