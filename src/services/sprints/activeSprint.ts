import type { Sprint } from "@/types/data";

// One place for "which sprint is active" so five call sites can't drift on what that means.
// find() is safe because sprints_one_active_per_board (a DB partial unique index) guarantees at most one.
export function activeSprintOf(sprints: Sprint[]): Sprint | null {
  return sprints.find((sprint) => sprint.state === "active") ?? null;
}

export function activeSprintIdOf(sprints: Sprint[]): string | null {
  return activeSprintOf(sprints)?.id ?? null;
}
