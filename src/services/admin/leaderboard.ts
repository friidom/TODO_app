import type { AdminBoard, AdminUser } from "./types";

export const LEADERBOARD_MODES = ["people", "boards"] as const;

export type LeaderboardMode = (typeof LEADERBOARD_MODES)[number];

export const LEADERBOARD_MODE_LABELS: Record<LeaderboardMode, string> = {
  people: "People",
  boards: "Boards",
};

export function isLeaderboardMode(value: unknown): value is LeaderboardMode {
  return (
    typeof value === "string" &&
    (LEADERBOARD_MODES as readonly string[]).includes(value)
  );
}

export type SortDirection = "asc" | "desc";

export function compareBy<T>(
  rows: T[],
  read: (row: T) => number | null,
  direction: SortDirection,
  tiebreak: (a: T, b: T) => number,
): T[] {
  return [...rows].sort((a, b) => {
    const left = read(a);
    const right = read(b);

    if (left === null && right === null) return tiebreak(a, b);
    if (left === null) return 1;
    if (right === null) return -1;

    const delta = direction === "asc" ? left - right : right - left;

    return delta || tiebreak(a, b);
  });
}

export const BOARD_SORT_KEYS = [
  "title",
  "completed_todos",
  "completed_points",
  "median_cycle_days",
  "comments",
  "activities",
  "open_todos",
  "members",
] as const;

export type BoardSortKey = (typeof BOARD_SORT_KEYS)[number];

export const BOARD_SORT_LABELS: Record<BoardSortKey, string> = {
  title: "Board",
  completed_todos: "Completed",
  completed_points: "Points",
  median_cycle_days: "Cycle",
  comments: "Comments",
  activities: "Activity",
  open_todos: "Open",
  members: "Members",
};

export const DEFAULT_BOARD_SORT: BoardSortKey = "completed_todos";

export function isBoardSortKey(value: unknown): value is BoardSortKey {
  return (
    typeof value === "string" &&
    (BOARD_SORT_KEYS as readonly string[]).includes(value)
  );
}

function boardName(board: AdminBoard): string {
  return board.title ?? "";
}

export function sortBoards(
  boards: AdminBoard[],
  key: BoardSortKey,
): AdminBoard[] {
  const tiebreak = (a: AdminBoard, b: AdminBoard): number =>
    boardName(a).localeCompare(boardName(b));

  if (key === "title") return [...boards].sort(tiebreak);

  const metric: Exclude<BoardSortKey, "title"> = key;

  return compareBy(
    boards,
    (board) => board[metric],
    metric === "median_cycle_days" ? "asc" : "desc",
    tiebreak,
  );
}

export interface LeaderboardMetric {
  key: string;
  label: string;
  hint: string;
}

export const PEOPLE_METRICS: LeaderboardMetric[] = [
  {
    key: "completed_todos",
    label: "Most completed",
    hint: "Tasks finished in this window",
  },
  {
    key: "completed_points",
    label: "Highest throughput",
    hint: "Estimate points finished in this window",
  },
  {
    key: "activities",
    label: "Most active",
    hint: "Recorded events across every board",
  },
  {
    key: "median_cycle_days",
    label: "Fastest median cycle",
    hint: "Started to done, median — shortest first",
  },
  {
    key: "comments",
    label: "Most discussion",
    hint: "Comments written in this window",
  },
  {
    key: "boards",
    label: "Broadest reach",
    hint: "Boards this person is a member of",
  },
  {
    key: "performance",
    label: "Against target",
    hint: "Completed points over the configured target",
  },
];

export const BOARD_METRICS: LeaderboardMetric[] = [
  {
    key: "completed_todos",
    label: "Most completed",
    hint: "Tasks finished in this window",
  },
  {
    key: "completed_points",
    label: "Highest throughput",
    hint: "Estimate points finished in this window",
  },
  {
    key: "activities",
    label: "Most active",
    hint: "Recorded events on the board",
  },
  {
    key: "median_cycle_days",
    label: "Fastest median cycle",
    hint: "Started to done, median — shortest first",
  },
];

export function metricsFor(mode: LeaderboardMode): LeaderboardMetric[] {
  return mode === "people" ? PEOPLE_METRICS : BOARD_METRICS;
}

// Inverted for ascending columns so the fastest row draws the longest bar.
export function metricShare(
  value: number | null,
  peak: number,
  direction: SortDirection,
): number {
  if (value === null || peak <= 0) return 0;

  if (direction === "desc") return Math.min(100, (value / peak) * 100);

  return Math.min(100, Math.max(0, (1 - value / peak) * 100));
}

export type LeaderboardRow = AdminUser | AdminBoard;
