import type { Activity } from "@/types/data";

/**
 * The feed, cut into days (M18).
 *
 * **A flat list of "3h ago / 5h ago / 2d ago / 2d ago" is a list of durations,
 * not a history.** Nothing in it says where yesterday ended, so finding "what
 * happened on Thursday" means reading every row and doing arithmetic. Day
 * headers put that boundary on screen once, and the relative stamp on each row
 * then only has to answer "how long ago within this day".
 *
 * Pure, and it takes `now` rather than reading the clock — the same rule
 * `relativeTime`, `dueStatus` and `recentCounts` follow, and the reason this is
 * a module of its own rather than a `useMemo` inside the feed: "is this
 * yesterday" has a boundary case at midnight and one at a year end, and those
 * are worth a test.
 *
 * **It groups by the VIEWER's local day, not by UTC.** `created_at` is a
 * `timestamptz` so the instant is unambiguous, and the question the header
 * answers — "was this today?" — is asked from where the reader is sitting.
 * This is the opposite of the rule `due_date` follows, and deliberately: a due
 * date is a day somebody chose and must read the same everywhere, while a
 * timestamp is an instant that must be rendered where it is read.
 */

/** One day's worth of entries, newest day first. */
export type ActivityDay = {
  /** `YYYY-MM-DD` in local time. Stable across renders, so it keys the list. */
  key: string;
  /** "Today", "Yesterday", or a written date. */
  label: string;
  items: Activity[];
};

/** The local calendar day of an instant, as `YYYY-MM-DD`. */
function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The day `offset` days from `from`, as a local `YYYY-MM-DD`.
 *
 * Built by mutating a copy through `setDate` rather than by subtracting
 * 86,400,000 milliseconds: a day is not always 24 hours long. On the two DST
 * boundaries a year, arithmetic on the epoch lands on the wrong side of
 * midnight and "Yesterday" silently becomes today's own header.
 */
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
  // The index is what makes this one pass rather than a sort-then-reduce: the
  // rows arrive newest-first from the query, so appending in order already
  // produces newest-day-first and every entry lands in the group its
  // predecessor opened.
  const index = new Map<string, ActivityDay>();

  for (const activity of activities) {
    const at = new Date(activity.created_at);

    // A timestamp the browser cannot parse is not a day. It still belongs in
    // the feed — the sentence is intact and the payload explains itself — so it
    // goes under a header that admits what it does not know rather than under
    // "Today", which would be a guess presented as a fact.
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

/**
 * What a day's header says.
 *
 * "Today" and "Yesterday" are named rather than dated because that is how the
 * two most-read groups are referred to out loud. Everything older gets the
 * weekday and the date — the weekday because "Thursday" is how people remember
 * the recent past, the date because past a week the weekday alone is ambiguous.
 * The year appears only when it is not the current one.
 */
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

  // Constructed and formatted in UTC, so the label cannot slip a day relative
  // to the `key` it was derived from. The key is already the local day; this
  // only turns those three numbers into words.
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...(String(year) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
}
