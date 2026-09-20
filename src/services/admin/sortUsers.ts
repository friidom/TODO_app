import type { AdminUser } from "./types";

export const USER_SORT_KEYS = [
  "username",
  "completed_todos",
  "completed_points",
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
  return [...users].sort((a, b) => {
    if (key === "username") return a.username.localeCompare(b.username);

    const left = a[key];
    const right = b[key];

    // An unclassified user has no performance, and must sort to the bottom
    // rather than below zero — they are unmeasured, not unproductive.
    if (left === null && right === null)
      return a.username.localeCompare(b.username);
    if (left === null) return 1;
    if (right === null) return -1;

    return right - left || a.username.localeCompare(b.username);
  });
}
