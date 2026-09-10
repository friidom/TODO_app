import type { Activity } from "@/types/data";

// pure, takes `now` instead of reading the clock — testable around midnight/DST/year-end edges.
// groups by the viewer's local day, not UTC — opposite of due_date, which is a chosen day and reads the same everywhere.
export type ActivityDay = {
  key: string;
  label: string;
  items: Activity[];
};

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

// setDate, not epoch math — a day isn't always 24h, and DST would land this on the wrong side of midnight
function shiftDay(from: Date, offset: number): string {
  const shifted = new Date(from);

  shifted.setDate(shifted.getDate() + offset);

  return localDay(shifted);
}

export function groupActivitiesByDay(
  activities: Activity[],
  now: Date = new Date(),
  locale?: string,
): ActivityDay[] {
  const today = localDay(now);
  const yesterday = shiftDay(now, -1);

  const days: ActivityDay[] = [];
  const index = new Map<string, ActivityDay>();

  for (const activity of activities) {
    const at = new Date(activity.created_at);
    // unparseable timestamp still belongs in the feed — goes under "Undated" rather than a guessed "Today"
    const key = Number.isNaN(at.getTime()) ? "unknown" : localDay(at);

    let day = index.get(key);

    if (!day) {
      day = { key, label: labelFor(key, today, yesterday, locale), items: [] };

      index.set(key, day);
      days.push(day);
    }

    day.items.push(activity);
  }

  return days;
}

function labelFor(
  key: string,
  today: string,
  yesterday: string,
  locale?: string,
): string {
  if (key === "unknown") return "Undated";
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";

  const [year, month, date] = key.split("-").map(Number);

  if (!year || !month || !date) return key;

  // built and formatted in UTC so the label can't slip a day relative to the key it came from
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...(String(year) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
}
