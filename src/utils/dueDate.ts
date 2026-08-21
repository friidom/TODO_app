/**
 * Due dates, treated as calendar days.
 *
 * **`todos.due_date` is `timestamptz`, not `date`** (M2-04,
 * `20260806092902_todos_task_fields.sql`). PostgREST returns it as a full ISO
 * instant — `2026-08-13T00:00:00+00:00` — even though nothing in the product
 * has ever asked the user for a time. Every function here converts to a
 * calendar day first and works on that.
 *
 * **The convention: a due date is midnight UTC, and the day is read back in
 * UTC.** Writing and reading through the same zone is what makes it round-trip;
 * converting to the viewer's local zone would move a date stored as midnight
 * UTC to the previous day for anyone west of Greenwich, so a card due the 13th
 * would read as the 12th in New York. `toCalendarDay` therefore slices the
 * leading `YYYY-MM-DD` rather than parsing to a `Date` and reading local parts.
 *
 * Comparison is then plain string comparison, which is correct because the
 * format is fixed-width and big-endian.
 */

export type DueStatus = "overdue" | "today" | "upcoming";

/**
 * The `YYYY-MM-DD` a stored value denotes.
 *
 * Accepts both shapes the column can produce: a full ISO instant, and a bare
 * date should the column ever be narrowed to `date`.
 */
export function toCalendarDay(value: string): string {
  return value.slice(0, 10);
}

/**
 * A calendar day as the instant to store — midnight UTC.
 *
 * Explicit `Z` rather than sending the bare `YYYY-MM-DD` and letting Postgres
 * cast it: that cast uses the *database's* timezone, so the value stored would
 * depend on a server setting rather than on what the user picked.
 */
export function fromCalendarDay(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/** The local calendar day as `YYYY-MM-DD`. What "today" means to the viewer. */
export function todayISO(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/** Where a due date sits relative to today. */
export function dueStatus(
  value: string,
  today: string = todayISO(),
): DueStatus {
  const day = toCalendarDay(value);

  if (day < today) return "overdue";
  if (day === today) return "today";

  return "upcoming";
}

/**
 * `2026-08-13T00:00:00+00:00` → `Aug 13`, or `13 Aug` / `13 авг.` depending on
 * the locale i18next is currently using.
 *
 * The year is added only when it is not the current one, so the card stays
 * compact in the common case. No time and no zone are ever shown — the column
 * carries an instant, but the product only ever means a day.
 *
 * Formatted in UTC deliberately, for the reason at the top of this file.
 */
/**
 * `2026-07-10T00:00:00+00:00` → `Jul 10, 2026`. Always with the year.
 *
 * `formatDue` drops the year in the current one, which is right on a card where
 * space is tight and "this year" is the assumption. It is wrong on the
 * timeline's drag readout: that label exists to remove all doubt about the day
 * a bar has landed on, and a window can straddle a new year while you drag
 * across it. Separate from `formatDue` rather than a flag on it, because the
 * two answer different questions and a boolean parameter at a call site says
 * neither of them out loud.
 *
 * Formatted in UTC, for the reason at the top of this file.
 */
export function formatDayFull(value: string, locale?: string): string {
  const day = toCalendarDay(value);
  const [year, month, date] = day.split("-").map(Number);

  if (!year || !month || !date) return day;

  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDue(
  value: string,
  today: string = todayISO(),
  locale?: string,
): string {
  const day = toCalendarDay(value);
  const [year, month, date] = day.split("-").map(Number);

  if (!year || !month || !date) return day;

  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(String(year) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
}
