// all arithmetic runs through Date.UTC, not local setDate — avoids landing on 23:00 the previous day across DST

export type CalendarDay = {
  day: string;
  inMonth: boolean;
};

const MS_PER_DAY = 86_400_000;

function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dayToMs(day: string): number {
  const [year, month, date] = day.split("-").map(Number);

  return Date.UTC(year, month - 1, date);
}

// always 42 entries (6 weeks) so the popover doesn't resize under the cursor when paging months
export function monthGrid(
  year: number,
  month: number,
  weekStartsOn: 0 | 1 = 1,
): CalendarDay[] {
  const firstOfMonth = Date.UTC(year, month, 1);
  const weekday = new Date(firstOfMonth).getUTCDay();

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

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month + delta;

  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}
