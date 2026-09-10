// due_date is timestamptz, not date, but the product only ever means a day — everything here works in UTC calendar days
// so a card due midnight UTC on the 13th doesn't read as the 12th for anyone west of Greenwich.

export type DueStatus = "overdue" | "today" | "upcoming";

export function toCalendarDay(value: string): string {
  return value.slice(0, 10);
}

// explicit Z, not a bare YYYY-MM-DD — letting Postgres cast it would use the server's timezone, not the user's
export function fromCalendarDay(day: string): string {
  return `${day}T00:00:00.000Z`;
}

export function todayISO(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

export function dueStatus(
  value: string,
  today: string = todayISO(),
): DueStatus {
  const day = toCalendarDay(value);

  if (day < today) return "overdue";
  if (day === today) return "today";

  return "upcoming";
}

// always shows the year — used on the timeline drag readout, where a drag can straddle new year's and ambiguity is the bug
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
