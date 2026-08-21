import type { IBoard, Todo } from "@/types/data";
import { DEFAULT_KEY_PREFIX, taskKey } from "@/utils/taskKey";

/**
 * The personal feed, as data (M21).
 *
 * **One row shape for all four tabs.** Recommended, Assigned, Worked on and
 * Viewed differ in *which* work items they return and *which timestamp* dates
 * them — an assignment is dated by `updated_at`, a view by when it was opened.
 * Everything after that is identical, so the tabs converge here and the list,
 * the grouping and the row renderer are written once. A per-tab item shape
 * would be four renderers drifting apart.
 *
 * **There is no Starred tab.** It was built and then removed: a star is the one
 * thing on this page that cannot be derived from existing data, so it needed a
 * `todo_stars` table, and that migration was never applied. Rather than ship a
 * tab that explains why it does not work, the feature is out until the table
 * is. Everything else here reads columns the schema already had.
 *
 * Pure, and it takes `now` rather than reading the clock — the same rule
 * `relativeTime`, `dueStatus`, `recentCounts` and `groupActivitiesByDay`
 * follow, and the reason the bucket boundaries are testable at all.
 */

/** One line in the feed: a work item, and why/when it is here. */
export interface FeedItem {
  todo: Todo;
  /** The instant this row is dated by. ISO, from whichever column the tab uses. */
  at: string;
  /** The board it lives on, for the `Task · KAN-4 · Board` line. */
  boardName: string | null;
  /** Assembled here so the row renders one value — see `taskKey`. */
  key: string | null;
}

/**
 * The tabs, in the order they render.
 *
 * `recommended` leads and is the default, which the brief asks for and which is
 * also the only tab that is never empty on an account with any work at all.
 */
export const FOR_YOU_TABS = [
  "recommended",
  "assigned",
  "workedon",
  "viewed",
] as const;

export type ForYouTab = (typeof FOR_YOU_TABS)[number];

export const FOR_YOU_TAB_LABELS: Record<ForYouTab, string> = {
  recommended: "Recommended",
  assigned: "Assigned to me",
  workedon: "Worked on",
  viewed: "Viewed",
};

/** A hand-edited `?tab=` is untrusted input, like every other param. */
export function isForYouTab(value: string | null): value is ForYouTab {
  return (FOR_YOU_TABS as readonly string[]).includes(value ?? "");
}

/**
 * Turn rows into feed items, dated by whichever timestamp the tab means.
 *
 * `boards` is `useBoards()` — already fetched for the sidebar, already
 * RLS-scoped, and the reason the board name costs no extra request. A todo
 * whose board is not in that list is dropped rather than rendered nameless:
 * the only way that happens is a row arriving from a board the caller cannot
 * see, which should not occur (RLS filters the query) and must not be shown if
 * it somehow does.
 */
export function toFeedItems(
  todos: Todo[],
  boards: IBoard[],
  /** Which instant dates the row. Defaults to the row's own `updated_at`. */
  dateOf: (todo: Todo) => string | null = (todo) =>
    todo.updated_at ?? todo.created_at,
): FeedItem[] {
  const byId = new Map(boards.map((board) => [board.id, board]));

  const items: FeedItem[] = [];

  for (const todo of todos) {
    const board = todo.board_id ? byId.get(todo.board_id) : undefined;

    // Defence in depth, not a normal path. Every query behind this is filtered
    // by RLS to boards the caller can reach, so a row whose board is absent
    // from their own board list is an anomaly — and the safe reading of an
    // anomaly is to omit it, never to render it without saying where it is from.
    if (!board) continue;

    const at = dateOf(todo);

    if (!at) continue;

    items.push({
      todo,
      at,
      boardName: board.title,
      key: taskKey(board.key_prefix ?? DEFAULT_KEY_PREFIX, todo.board_key),
    });
  }

  return items;
}

/**
 * Newest first, and never two rows for one work item.
 *
 * The Recommended tab is a union of several sources — recently updated work and
 * work assigned to you — and a task that is both would otherwise appear twice.
 * The first occurrence wins, so callers pass their most meaningful source
 * first, and the sort afterwards is what actually orders the result.
 */
export function mergeFeed(...sources: FeedItem[][]): FeedItem[] {
  const seen = new Set<string>();
  const merged: FeedItem[] = [];

  for (const source of sources) {
    for (const item of source) {
      if (seen.has(item.todo.id)) continue;

      seen.add(item.todo.id);
      merged.push(item);
    }
  }

  return merged.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/**
 * The buckets the feed is cut into, coarsest-grained last.
 *
 * **Not `groupActivitiesByDay`, and the difference is the point.** That one
 * gives every day its own header, which is right for a board's history where
 * you are looking for what happened on Thursday. A personal feed is read for
 * recency, not for a specific date, so past this week a header per day would be
 * twenty headers of one row each. Jira's answer — and the brief's — is a
 * handful of widening windows, and this is that list.
 */
export const FEED_PERIODS = [
  "today",
  "yesterday",
  "week",
  "lastweek",
  "month",
  "older",
] as const;

export type FeedPeriod = (typeof FEED_PERIODS)[number];

export const FEED_PERIOD_LABELS: Record<FeedPeriod, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Earlier this week",
  lastweek: "Last week",
  month: "Earlier this month",
  older: "Older",
};

export interface FeedGroup {
  period: FeedPeriod;
  label: string;
  items: FeedItem[];
}

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
 * 86,400,000 milliseconds, for the reason `activityGroups.ts` records: a day is
 * not always 24 hours long, and on the two DST boundaries a year epoch
 * arithmetic lands on the wrong side of midnight — so "Yesterday" silently
 * becomes today's own header.
 */
function shiftDay(from: Date, offset: number): string {
  const shifted = new Date(from);

  shifted.setDate(shifted.getDate() + offset);

  return localDay(shifted);
}

/**
 * Which bucket a day falls in, relative to today.
 *
 * **Boundaries are calendar boundaries, not elapsed durations.** "Earlier this
 * week" means since the Monday just gone, so on a Tuesday it holds one day and
 * on a Sunday it holds five — which is what the phrase means to a reader. An
 * elapsed-hours version would put Monday in "this week" on Tuesday and in "last
 * week" on Wednesday, and the row would appear to move for no reason.
 *
 * Ordered by narrowest first, and the first match wins, so today is never also
 * "this week".
 */
export function periodOf(day: string, now: Date): FeedPeriod {
  const today = localDay(now);

  if (day >= today) return "today";
  if (day === shiftDay(now, -1)) return "yesterday";

  // Monday of the current week. `getDay()` is 0 for Sunday, and the product
  // treats Monday as the first day (see `WEEK_STARTS_ON_MONDAY` in calendar.ts).
  const weekday = (now.getDay() + 6) % 7;
  const monday = shiftDay(now, -weekday);

  if (day >= monday) return "week";

  const lastMonday = shiftDay(new Date(now), -weekday - 7);

  if (day >= lastMonday) return "lastweek";

  // The 1st of the current month, in local time — the same "calendar boundary,
  // not 30 days" rule as the week above.
  const firstOfMonth = `${today.slice(0, 7)}-01`;

  if (day >= firstOfMonth) return "month";

  return "older";
}

/**
 * The feed, cut into its periods.
 *
 * Empty buckets are omitted, so a feed of three items from this morning renders
 * one header rather than six with five apologies. The order is `FEED_PERIODS`
 * regardless of the order rows arrive in, and the rows inside a bucket keep the
 * order they were given — which `mergeFeed` has already made newest-first.
 */
export function groupFeed(
  items: FeedItem[],
  now: Date = new Date(),
): FeedGroup[] {
  const buckets = new Map<FeedPeriod, FeedItem[]>();

  for (const item of items) {
    const at = new Date(item.at);

    // An unparseable timestamp is not a date. It still belongs in the feed —
    // the work item is real — so it goes in the oldest bucket rather than under
    // "Today", which would be a guess presented as a fact.
    const period = Number.isNaN(at.getTime())
      ? "older"
      : periodOf(localDay(at), now);

    const bucket = buckets.get(period);

    if (bucket) bucket.push(item);
    else buckets.set(period, [item]);
  }

  return FEED_PERIODS.filter((period) => buckets.has(period)).map((period) => ({
    period,
    label: FEED_PERIOD_LABELS[period],
    items: buckets.get(period)!,
  }));
}
