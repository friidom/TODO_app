import i18n, { translated } from "@/components/i18n";
import type { AdminBoard, AdminUser } from "./types";

export const LEADERBOARD_MODES = ["people", "boards"] as const;

export type LeaderboardMode = (typeof LEADERBOARD_MODES)[number];

export const LEADERBOARD_MODE_LABELS = translated<LeaderboardMode>({
  people: "admin.modes.people",
  boards: "boards.title",
});

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

export const BOARD_SORT_LABELS = translated<BoardSortKey>({
  title: "sidebar.board",
  completed_todos: "fields.completed",
  completed_points: "admin.columns.points",
  median_cycle_days: "admin.columns.cycle",
  comments: "taskActivity.comments",
  activities: "board.activity",
  open_todos: "admin.columns.open",
  members: "board.members",
});

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
    get label() {
      return i18n.t("admin.leaders.mostCompleted");
    },
    get hint() {
      return i18n.t("admin.leaders.completedHint");
    },
  },
  {
    key: "completed_points",
    get label() {
      return i18n.t("admin.leaders.throughput");
    },
    get hint() {
      return i18n.t("admin.leaders.throughputHint");
    },
  },
  {
    key: "activities",
    get label() {
      return i18n.t("admin.leaders.mostActive");
    },
    get hint() {
      return i18n.t("admin.leaders.activeHint");
    },
  },
  {
    key: "median_cycle_days",
    get label() {
      return i18n.t("admin.leaders.fastestCycle");
    },
    get hint() {
      return i18n.t("admin.leaders.cycleHint");
    },
  },
  {
    key: "comments",
    get label() {
      return i18n.t("admin.leaders.mostDiscussion");
    },
    get hint() {
      return i18n.t("admin.leaders.discussionHint");
    },
  },
  {
    key: "boards",
    get label() {
      return i18n.t("admin.leaders.reach");
    },
    get hint() {
      return i18n.t("admin.leaders.reachHint");
    },
  },
  {
    key: "performance",
    get label() {
      return i18n.t("admin.leaders.againstTarget");
    },
    get hint() {
      return i18n.t("admin.leaders.targetHint");
    },
  },
];

export const BOARD_METRICS: LeaderboardMetric[] = [
  {
    key: "completed_todos",
    get label() {
      return i18n.t("admin.leaders.mostCompleted");
    },
    get hint() {
      return i18n.t("admin.leaders.completedHint");
    },
  },
  {
    key: "completed_points",
    get label() {
      return i18n.t("admin.leaders.throughput");
    },
    get hint() {
      return i18n.t("admin.leaders.throughputHint");
    },
  },
  {
    key: "activities",
    get label() {
      return i18n.t("admin.leaders.mostActive");
    },
    get hint() {
      return i18n.t("admin.leaders.activeBoardHint");
    },
  },
  {
    key: "median_cycle_days",
    get label() {
      return i18n.t("admin.leaders.fastestCycle");
    },
    get hint() {
      return i18n.t("admin.leaders.cycleHint");
    },
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
