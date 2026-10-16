import { translated } from "@/components/i18n";
import { COLUMN_CATEGORIES, type ColumnCategory } from "@/constants/columns";
import type { IBoard, Todo } from "@/types/data";
import { taskKey } from "@/utils/taskKey";
import type { BoardVisit } from "./viewed";

export interface FeedStatus {
  name: string;
  category: ColumnCategory;
}

// The /me reads join the status in; a row built from a board's own todos has none.
export type FeedTodo = Todo & { status?: FeedStatus | null };

export interface FeedItem {
  todo: FeedTodo;
  at: string;
  boardName: string | null;
  key: string | null;
}

export const FOR_YOU_TABS = [
  "recommended",
  "assigned",
  "workedon",
  "viewed",
] as const;

export type ForYouTab = (typeof FOR_YOU_TABS)[number];

export const FOR_YOU_TAB_LABELS = translated<ForYouTab>({
  recommended: "forYou.tabs.recommended",
  assigned: "members.assignedToMe",
  workedon: "forYou.tabs.workedOn",
  viewed: "forYou.tabs.viewed",
});

export function isForYouTab(value: string | null): value is ForYouTab {
  return (FOR_YOU_TABS as readonly string[]).includes(value ?? "");
}

export function toFeedItems(
  todos: FeedTodo[],
  boards: IBoard[],
  dateOf: (todo: Todo) => string | null = (todo) =>
    todo.updated_at ?? todo.created_at,
): FeedItem[] {
  const byId = new Map(boards.map((board) => [board.id, board]));

  const items: FeedItem[] = [];

  for (const todo of todos) {
    const board = todo.board_id ? byId.get(todo.board_id) : undefined;

    // RLS scopes the query, so a todo missing from the caller's own board list is an anomaly — drop it, don't render it homeless.
    if (!board) continue;

    const at = dateOf(todo);

    if (!at) continue;

    items.push({
      todo,
      at,
      boardName: board.title,
      key: taskKey(board.key_prefix, todo.board_key),
    });
  }

  return items;
}

// First occurrence wins, so pass your most meaningful source first.
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

export const FEED_PERIODS = [
  "today",
  "yesterday",
  "week",
  "lastweek",
  "month",
  "older",
] as const;

export type FeedPeriod = (typeof FEED_PERIODS)[number];

export const FEED_PERIOD_LABELS = translated<FeedPeriod>({
  today: "time.today",
  yesterday: "time.yesterday",
  week: "forYou.periods.week",
  lastweek: "forYou.periods.lastWeek",
  month: "forYou.periods.month",
  older: "forYou.periods.older",
});

export interface FeedGroup {
  period: FeedPeriod;
  label: string;
  items: FeedItem[];
}

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

// setDate, not ms subtraction — DST boundaries make a "day" not always 24 hours.
function shiftDay(from: Date, offset: number): string {
  const shifted = new Date(from);

  shifted.setDate(shifted.getDate() + offset);

  return localDay(shifted);
}

// Calendar boundaries, not elapsed durations — "this week" means since Monday, so it holds a different number of days depending on today.
export function periodOf(day: string, now: Date): FeedPeriod {
  const today = localDay(now);

  if (day >= today) return "today";
  if (day === shiftDay(now, -1)) return "yesterday";

  const weekday = (now.getDay() + 6) % 7; // Monday-first week
  const monday = shiftDay(now, -weekday);

  if (day >= monday) return "week";

  const lastMonday = shiftDay(new Date(now), -weekday - 7);

  if (day >= lastMonday) return "lastweek";

  const firstOfMonth = `${today.slice(0, 7)}-01`;

  if (day >= firstOfMonth) return "month";

  return "older";
}

export function groupFeed(
  items: FeedItem[],
  now: Date = new Date(),
): FeedGroup[] {
  const buckets = new Map<FeedPeriod, FeedItem[]>();

  for (const item of items) {
    const at = new Date(item.at);

    // unparseable timestamp still belongs in the feed, just in the oldest bucket rather than a guessed "Today"
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

export const STATUS_GROUPS = [
  "in_progress",
  "in_review",
  "todo",
  "backlog",
  "done",
] as const;

export type StatusGroupKey = (typeof STATUS_GROUPS)[number];

export interface StatusGroup {
  key: StatusGroupKey;
  items: FeedItem[];
}

function isCategory(value: unknown): value is ColumnCategory {
  return typeof value === "string" && value in COLUMN_CATEGORIES;
}

// An unknown category reads as todo, the fallback categoryOf uses.
export function groupByStatus(items: FeedItem[]): StatusGroup[] {
  const buckets = new Map<StatusGroupKey, FeedItem[]>();

  for (const item of items) {
    const category = item.todo.status?.category;
    const key: StatusGroupKey =
      item.todo.status_id === null
        ? "backlog"
        : isCategory(category)
          ? category
          : "todo";

    const bucket = buckets.get(key);

    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  return STATUS_GROUPS.filter((key) => buckets.has(key)).map((key) => ({
    key,
    items: buckets.get(key)!,
  }));
}

export interface BoardShortcut {
  board: IBoard;
  visitedAt: string | null;
}

// The rest follow by title so a browser with no visits still gets shortcuts.
export function recentBoards(
  boards: IBoard[],
  visits: BoardVisit[],
  limit: number,
): BoardShortcut[] {
  const byId = new Map(boards.map((board) => [board.id, board]));
  const shortcuts: BoardShortcut[] = [];
  const taken = new Set<string>();

  for (const visit of visits) {
    const board = byId.get(visit.id);

    if (!board || taken.has(board.id)) continue;

    taken.add(board.id);
    shortcuts.push({ board, visitedAt: visit.at });
  }

  const rest = boards
    .filter((board) => !taken.has(board.id))
    .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));

  for (const board of rest) {
    shortcuts.push({ board, visitedAt: null });
  }

  return shortcuts.slice(0, limit);
}
