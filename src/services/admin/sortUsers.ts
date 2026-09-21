import { compareBy } from "./leaderboard";
import type { AdminUser } from "./types";

export const USER_SORT_KEYS = [
  "username",
  "completed_todos",
  "completed_points",
  "median_cycle_days",
  "comments",
  "activities",
  "boards",
  "performance",
] as const;

export type UserSortKey = (typeof USER_SORT_KEYS)[number];

export const USER_SORT_LABELS: Record<UserSortKey, string> = {
  username: "Developer",
  completed_todos: "Tasks",
  completed_points: "Points",
  median_cycle_days: "Cycle",
  comments: "Comments",
  activities: "Activity",
  boards: "Boards",
  performance: "Performance",
};

export const DEFAULT_USER_SORT: UserSortKey = "completed_todos";

export function isUserSortKey(value: unknown): value is UserSortKey {
  return (
    typeof value === "string" &&
    (USER_SORT_KEYS as readonly string[]).includes(value)
  );
}

// One factual column at a time, never a blend. There is no composite score in
// M34 and a sort that mixed columns would be one by the back door.
export function sortUsers(users: AdminUser[], key: UserSortKey): AdminUser[] {
  const tiebreak = (a: AdminUser, b: AdminUser): number =>
    a.username.localeCompare(b.username);

  if (key === "username") return [...users].sort(tiebreak);

  const metric: Exclude<UserSortKey, "username"> = key;

  return compareBy(
    users,
    (user) => user[metric],
    metric === "median_cycle_days" ? "asc" : "desc",
    tiebreak,
  );
}
