import type { Todo } from "@/types/data";
import { toCalendarDay } from "@/utils/dueDate";

/**
 * The calendar's date arithmetic, as pure string maths (M19).
 *
 * **Everything here speaks `YYYY-MM-DD` and nothing here speaks `Date`.** That
 * is the milestone's stated rule — *"`due_date` is a calendar day and the
 * calendar must not 'fix' that. No timezone conversion anywhere"* — and it is
 * what makes a task due the 14th appear on the 14th for a reader in Tashkent
 * and a reader in Los Angeles. A `Date` constructed from a stored value and
 * read back with `getDate()` would shift for everyone west of Greenwich, which
 * is the bug `utils/dueDate.ts` was written to avoid and this module inherits.
 *
 * A `Date` is used *inside* two helpers, always through `Date.UTC` and always
 * discarded before returning. UTC has no daylight saving, so adding a day is
 * adding 86,400,000 milliseconds exactly — the one place naive epoch arithmetic
 * is safe, and the reason it is quarantined here instead of spread across the
 * components.
 *
 * Pure, so it takes its anchor rather than reading the clock, and so the month
 * boundaries and leap years are testable. `calendar.test.ts` is that test.
 */

/** The two shapes a calendar can take. Order is the order the toggle renders. */
export const CALENDAR_LAYOUTS = ["month", "week"] as const;

export type CalendarLayout = (typeof CALENDAR_LAYOUTS)[number];

/**
 * **The week starts Monday, everywhere, and it is not configurable.**
 *
 * Two of the product's three locales (ru, uz) have no other reading, and en-GB
 * agrees; only en-US would start Sunday. A per-user week-start is a setting
 * with a storage decision, a migration and a preferences surface behind it, and
 * nothing has asked for one — so this is a constant with a reason rather than
 * an option with a default.
 */
const WEEK_STARTS_ON_MONDAY = true;

/**
 * How many work items a day cell shows before it stops listing them.
 *
 * **The overflow rule, decided once**, because M19 states it recurs in both
 * layouts. The rule itself is one sentence — *show N, then a control that opens
 * the whole day* — and only N varies, with the height the layout gives a cell.
 * A month cell is roughly a fifth of the grid; a week cell is the full height.
 *
 * The alternative, scrolling inside a cell, was rejected: a scrollbar in one of
 * thirty-five boxes is invisible until you are already inside it, so a day with
 * nine items looks exactly like a day with three.
 */
export const DAY_ITEM_LIMIT: Record<CalendarLayout, number> = {
  month: 3,
  week: 10,
};

/** `YYYY-MM-DD` → the three numbers, or null when it is not a day. */
function parts(day: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);

  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** A UTC instant → the `YYYY-MM-DD` it denotes, in UTC. */
function format(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/**
 * The instant a day denotes, at midnight UTC.
 *
 * Falls back to the epoch for an unparseable string rather than producing an
 * Invalid Date that poisons every calculation downstream silently. A malformed
 * `?date=` in a hand-edited URL is untrusted input like any other.
 */
function instant(day: string): Date {
  const p = parts(day);

  if (!p) return new Date(Date.UTC(1970, 0, 1));

  return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
}

/** `n` days after `day` (negative goes back). */
export function addDays(day: string, n: number): string {
  return format(new Date(instant(day).getTime() + n * 86_400_000));
}

/**
 * `n` months after `day`, clamped into the target month.
 *
 * 31 January + 1 month is 28 February, not 3 March. `Date` rolls the overflow
 * forward, which would make paging from a 31-day month skip the next one
 * entirely — press "next" on 31 January and land in March.
 */
export function addMonths(day: string, n: number): string {
  const p = parts(day);

  if (!p) return day;

  const [year, month, date] = p;
  const target = new Date(Date.UTC(year, month - 1 + n, 1));

  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  target.setUTCDate(Math.min(date, lastDay));

  return format(target);
}

/** The Monday on or before `day`. */
export function startOfWeek(day: string): string {
  const weekday = instant(day).getUTCDay(); // 0 = Sunday

  const back = WEEK_STARTS_ON_MONDAY ? (weekday + 6) % 7 : weekday;

  return addDays(day, -back);
}

/** The first of `day`'s month. */
export function startOfMonth(day: string): string {
  const p = parts(day);

  if (!p) return day;

  return `${String(p[0]).padStart(4, "0")}-${String(p[1]).padStart(2, "0")}-01`;
}

/**
 * The six weeks a month grid draws, as a flat array of 42 days.
 *
 * **Always six rows, never five.** A month that fits in five would make the
 * grid change height as you page through the year, which moves every cell under
 * the cursor and is exactly the layout shift the brief rules out. Six rows also
 * covers the worst case — a 31-day month beginning on a Sunday — so the count
 * is fixed rather than computed.
 *
 * Leading and trailing days belong to the neighbouring months and are rendered
 * dimmed rather than blank: a task due the 1st is a task the last week of the
 * previous month needs to show.
 */
export function monthMatrix(anchor: string): string[] {
  const first = startOfWeek(startOfMonth(anchor));

  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** The seven days of `anchor`'s week, Monday first. */
export function weekMatrix(anchor: string): string[] {
  const first = startOfWeek(anchor);

  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** The days a layout draws. One entry point, so a caller never picks. */
export function matrixFor(layout: CalendarLayout, anchor: string): string[] {
  return layout === "month" ? monthMatrix(anchor) : weekMatrix(anchor);
}

/** Whether `day` belongs to `anchor`'s month — what dims the padding days. */
export function isSameMonth(day: string, anchor: string): boolean {
  return day.slice(0, 7) === anchor.slice(0, 7);
}

/**
 * Work items by the day they are due, keyed `YYYY-MM-DD`.
 *
 * Through `toCalendarDay`, which slices the leading day out of whatever the
 * column produced — never `new Date(value).getDate()`, which is the conversion
 * this whole module exists to avoid.
 *
 * Undated items are **not** in the map. They are a real part of the board and
 * get their own strip; silently dropping them here is what the milestone calls
 * *"the same lie the filtered task count was fixed to avoid"*.
 *
 * Insertion order is preserved, so within a day the items stay in the order the
 * M16 pipeline handed over.
 */
export function groupByDueDay(todos: Todo[]): Map<string, Todo[]> {
  const days = new Map<string, Todo[]>();

  for (const todo of todos) {
    if (!todo.due_date) continue;

    const day = toCalendarDay(todo.due_date);
    const bucket = days.get(day);

    if (bucket) bucket.push(todo);
    else days.set(day, [todo]);
  }

  return days;
}

/** The work items with no due date — the side strip's contents. */
export function undatedTodos(todos: Todo[]): Todo[] {
  return todos.filter((todo) => !todo.due_date);
}

/**
 * How many of the visible items the calendar's grid is not currently showing.
 *
 * Undated items plus anything dated outside the drawn range. The header reports
 * it for the same reason the board reports "3 of 57": a view that shows a
 * fraction of the board without saying so is lying by omission, and paging to
 * an empty March should not look like an empty board.
 */
export function offscreenCount(
  todos: Todo[],
  days: string[],
  undatedShown: boolean,
): number {
  const drawn = new Set(days);

  let count = 0;

  for (const todo of todos) {
    if (!todo.due_date) {
      if (!undatedShown) count += 1;
      continue;
    }

    if (!drawn.has(toCalendarDay(todo.due_date))) count += 1;
  }

  return count;
}

/** The month a header names, e.g. `August 2026`. */
export function monthLabel(anchor: string, locale?: string): string {
  const p = parts(anchor);

  if (!p) return anchor;

  return new Date(Date.UTC(p[0], p[1] - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The week a header names, e.g. `10 – 16 August 2026`.
 *
 * The month is printed once when the week does not straddle two, and twice when
 * it does — the alternative, always printing both, reads as a bug in the common
 * case.
 */
export function weekLabel(anchor: string, locale?: string): string {
  const days = weekMatrix(anchor);
  const first = instant(days[0]);
  const last = instant(days[6]);

  const sameMonth = days[0].slice(0, 7) === days[6].slice(0, 7);

  const startOptions: Intl.DateTimeFormatOptions = sameMonth
    ? { day: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "short", timeZone: "UTC" };

  return `${first.toLocaleDateString(locale, startOptions)} – ${last.toLocaleDateString(
    locale,
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  )}`;
}

/** The weekday headings, Monday first, in the caller's locale. */
export function weekdayNames(locale?: string): string[] {
  // 2026-08-03 is a Monday. Any Monday would do; a fixed one keeps this pure.
  return Array.from({ length: 7 }, (_, i) =>
    instant(addDays("2026-08-03", i)).toLocaleDateString(locale, {
      weekday: "short",
      timeZone: "UTC",
    }),
  );
}
