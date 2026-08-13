/**
 * The days a month view shows, as `YYYY-MM-DD` strings.
 *
 * Pure and free of `Date` arithmetic at the call site, which is the point: the
 * picker only ever handles calendar days, and the one place that could drift
 * into instants and timezones is here, where it is tested.
 *
 * All arithmetic runs through `Date.UTC`, so adding a day can never land on 23:00
 * the previous day across a daylight-saving boundary — which is exactly what
 * `new Date(y, m, d)` plus local `setDate` does twice a year.
 */

export type CalendarDay = {
  /** `YYYY-MM-DD`. */
  day: string;
  /** False for the leading/trailing days borrowed from the adjacent months. */
  inMonth: boolean;
};

const MS_PER_DAY = 86_400_000;

function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → epoch ms at midnight UTC. */
export function dayToMs(day: string): number {
  const [year, month, date] = day.split("-").map(Number);

  return Date.UTC(year, month - 1, date);
}

/**
 * Six weeks of days covering `year`/`month`, always 42 entries.
 *
 * Fixed at six rather than five-or-six so the popover does not change height
 * when the user pages between months — a grid that resizes under the cursor is
 * how a click lands on the wrong day.
 *
 * @param month 0-indexed, like `Date`.
 * @param weekStartsOn 0 = Sunday, 1 = Monday.
 */
export function monthGrid(
  year: number,
  month: number,
  weekStartsOn: 0 | 1 = 1,
): CalendarDay[] {
  const firstOfMonth = Date.UTC(year, month, 1);
  const weekday = new Date(firstOfMonth).getUTCDay();

  // How far back to the start of the week the 1st falls in.
  const lead = (weekday - weekStartsOn + 7) % 7;
  const start = firstOfMonth - lead * MS_PER_DAY;

  return Array.from({ length: 42 }, (_, index) => {
    const ms = start + index * MS_PER_DAY;

    return {
      day: toDay(ms),
      inMonth: new Date(ms).getUTCMonth() === month,
    };
  });
}

/** Shifts a month, carrying the year. `delta` is in months. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month + delta;

  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}
