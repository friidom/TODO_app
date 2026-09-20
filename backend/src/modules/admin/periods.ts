import { env } from "../../config/env.js";

// The six reporting periods, declared once (M34 D-11). Every endpoint, every
// chart and every filter reads this list; a period spelled out at a call site
// is the bug this file exists to prevent.
//
// The frontend carries the same six values and their labels for its selector,
// and deliberately not this arithmetic: the server owns what a period MEANS,
// the client owns what it is called. A drifted value there is rejected by the
// Zod enum in admin.schema.ts and fails loudly on the first request, which is
// why there is no shared fixture like permissions-matrix.json.
export const ADMIN_PERIODS = ["1d", "7d", "30d", "3m", "quarter", "year"] as const;

export type AdminPeriod = (typeof ADMIN_PERIODS)[number];

// 7 and 30 days are what a person actually asks about, and what every screen
// opens on. The other four exist so a longer question has an answer.
export const DEFAULT_PERIOD: AdminPeriod = "7d";

// The unit each series is bucketed by. A year at daily resolution is 365 bars
// nobody can read; a day at daily resolution is one bar.
export type Bucket = "hour" | "day" | "week" | "month";

const BUCKETS: Record<AdminPeriod, Bucket> = {
  "1d": "hour",
  "7d": "day",
  "30d": "day",
  "3m": "week",
  quarter: "week",
  year: "month",
};

export interface PeriodRange {
  period: AdminPeriod;
  bucket: Bucket;
  from: Date;
  to: Date;
}

export function isAdminPeriod(value: unknown): value is AdminPeriod {
  return typeof value === "string" && (ADMIN_PERIODS as readonly string[]).includes(value);
}

export function bucketOf(period: AdminPeriod): Bucket {
  return BUCKETS[period];
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsIn(at: Date, zone: string): Parts {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(formatted.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

// The instant at which the wall clock in `zone` reads the given local time.
// Two passes, not one: the first guess uses the offset in force at the UTC
// interpretation of that wall clock, which is the wrong side of a DST
// boundary for a few hours a year, and the second correction lands it.
function instantOf(parts: Parts, zone: string): Date {
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  let guess = wall;

  for (let pass = 0; pass < 2; pass += 1) {
    const at = new Date(guess);
    const local = partsIn(at, zone);
    const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);

    guess = wall - (asUtc - at.getTime());
  }

  return new Date(guess);
}

function startOfDay(now: Date, zone: string): Date {
  const parts = partsIn(now, zone);

  return instantOf({ ...parts, hour: 0, minute: 0, second: 0 }, zone);
}

function startOfQuarter(now: Date, zone: string): Date {
  const parts = partsIn(now, zone);
  const firstMonthOfQuarter = Math.floor((parts.month - 1) / 3) * 3 + 1;

  return instantOf(
    { ...parts, month: firstMonthOfQuarter, day: 1, hour: 0, minute: 0, second: 0 },
    zone,
  );
}

function startOfYear(now: Date, zone: string): Date {
  const parts = partsIn(now, zone);

  return instantOf({ ...parts, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, zone);
}

function minus(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

function minusMonths(now: Date, months: number, zone: string): Date {
  const parts = partsIn(now, zone);
  const shifted = parts.month - months;
  const year = parts.year + Math.floor((shifted - 1) / 12);
  const month = ((((shifted - 1) % 12) + 12) % 12) + 1;

  // Clamped, so three months before 31 May is 28/29 February rather than
  // rolling forward into March.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return instantOf({ ...parts, year, month, day: Math.min(parts.day, lastDay) }, zone);
}

// THE ONE PLACE A PERIOD BECOMES A WINDOW (M34 D-15).
//
// A duration is a rolling window; a calendar noun is that calendar unit to
// date. `1d` is the exception and is deliberate: it is the period compared
// against daily_points, and a rolling 24 hours against a daily target is not
// a like-for-like comparison.
//
// So `3m` and `quarter` are never the same window -- on 20 September, `3m`
// reaches back to 20 June and `quarter` reaches back to 1 July. Both are
// listed because both are real questions.
export function periodRange(
  period: AdminPeriod,
  now: Date = new Date(),
  zone: string = env.APP_TIMEZONE,
): PeriodRange {
  const from = ((): Date => {
    switch (period) {
      case "1d":
        return startOfDay(now, zone);
      case "7d":
        return minus(now, 7);
      case "30d":
        return minus(now, 30);
      case "3m":
        return minusMonths(now, 3, zone);
      case "quarter":
        return startOfQuarter(now, zone);
      case "year":
        return startOfYear(now, zone);
    }
  })();

  return { period, bucket: BUCKETS[period], from, to: now };
}

// How much of the window has elapsed, which is what turns a weekly target
// into a target for this period (D-16).
export function windowDays(range: Pick<PeriodRange, "from" | "to">): number {
  return (range.to.getTime() - range.from.getTime()) / 86_400_000;
}

// The heatmap's window, and the only one in the API that ignores the selected
// period (E2, V6). Its question is year-shaped: a seven-day heatmap is seven
// squares. 52 weeks back to the start of that week, so the grid is whole.
export const HEATMAP_WEEKS = 53;

export function heatmapRange(now: Date = new Date(), zone: string = env.APP_TIMEZONE): PeriodRange {
  const today = startOfDay(now, zone);
  const weekday = new Date(today).getUTCDay();
  const startOfThisWeek = new Date(today.getTime() - weekday * 86_400_000);

  return {
    period: "year",
    bucket: "day",
    from: new Date(startOfThisWeek.getTime() - (HEATMAP_WEEKS - 1) * 7 * 86_400_000),
    to: now,
  };
}
