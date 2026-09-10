import type { Todo } from "@/types/data";
import { toCalendarDay } from "@/utils/dueDate";

// Pure YYYY-MM-DD string math — never `new Date(value).getDate()`, which shifts a day for anyone west of Greenwich.
// Date is only used internally via Date.UTC and always discarded before returning.

export const CALENDAR_LAYOUTS = ["month", "week"] as const;

export type CalendarLayout = (typeof CALENDAR_LAYOUTS)[number];

// Monday start everywhere — not configurable, nothing's asked for one yet.
const WEEK_STARTS_ON_MONDAY = true;

// Week view scrolls, so it has no limit; month cells are too small for a scrollbar to be discoverable, so they cap and overflow to "+N more".
export const DAY_ITEM_LIMIT: Record<CalendarLayout, number> = {
  month: 3,
  week: Number.POSITIVE_INFINITY,
};

function parts(day: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);

  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function format(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${date.getUTCFullYear()}-${month}-${day}`;
}

// Falls back to the epoch for a bad string instead of poisoning downstream math with an Invalid Date.
function instant(day: string): Date {
  const p = parts(day);

  if (!p) return new Date(Date.UTC(1970, 0, 1));

  return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
}

export function addDays(day: string, n: number): string {
  return format(new Date(instant(day).getTime() + n * 86_400_000));
}

// Clamped into the target month — 31 Jan + 1 month is 28 Feb, not 3 Mar.
export function addMonths(day: string, n: number): string {
  const p = parts(day);

  if (!p) return day;

  const [year, month, date] = p;
  const target = new Date(Date.UTC(year, month - 1 + n, 1));

  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  target.setUTCDate(Math.min(date, lastDay));

  return format(target);
}

export function startOfWeek(day: string): string {
  const weekday = instant(day).getUTCDay(); // 0 = Sunday

  const back = WEEK_STARTS_ON_MONDAY ? (weekday + 6) % 7 : weekday;

  return addDays(day, -back);
}

export function startOfMonth(day: string): string {
  const p = parts(day);

  if (!p) return day;

  return `${String(p[0]).padStart(4, "0")}-${String(p[1]).padStart(2, "0")}-01`;
}

// Always six rows so paging months doesn't shift the grid height under the cursor.
export function monthMatrix(anchor: string): string[] {
  const first = startOfWeek(startOfMonth(anchor));

  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function weekMatrix(anchor: string): string[] {
  const first = startOfWeek(anchor);

  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export function matrixFor(layout: CalendarLayout, anchor: string): string[] {
  return layout === "month" ? monthMatrix(anchor) : weekMatrix(anchor);
}

export function isSameMonth(day: string, anchor: string): boolean {
  return day.slice(0, 7) === anchor.slice(0, 7);
}

// Undated items aren't in the map — they get their own strip rather than silently vanishing.
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

export function undatedTodos(todos: Todo[]): Todo[] {
  return todos.filter((todo) => !todo.due_date);
}

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

export function monthLabel(anchor: string, locale?: string): string {
  const p = parts(anchor);

  if (!p) return anchor;

  return new Date(Date.UTC(p[0], p[1] - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

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

export function weekdayNames(locale?: string): string[] {
  // 2026-08-03 is a Monday — any Monday works, a fixed one just keeps this pure.
  return Array.from({ length: 7 }, (_, i) =>
    instant(addDays("2026-08-03", i)).toLocaleDateString(locale, {
      weekday: "short",
      timeZone: "UTC",
    }),
  );
}
