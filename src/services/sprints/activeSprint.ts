import type { Sprint } from "@/types/data";

/**
 * The board's running sprint, or null when none is.
 *
 * Its own module because five callers need the same answer and were each
 * spelling it out: `useTodosByColumns` (what the Board shows), `useAddTodo`
 * (which sprint a new Board card joins), `useAddBacklogItem` (whether a new
 * Backlog item lands on the Board immediately), `BacklogView` (what it hands
 * its drag handler) and `BacklogRow` (what its Sprint dropdown assigns
 * against). Five copies of `sprints.find(s => s.state === "active")` is five
 * places for "active" to drift into meaning something else.
 *
 * A bare `sprint.state === "active"` on a *single* sprint — the "Active"
 * badge, the Timeline band's styling — is a different question and stays
 * where it is.
 *
 * A board has at most one active sprint, enforced in the database by the
 * partial unique index `sprints_one_active_per_board` — so `find` is the
 * whole implementation rather than a first-of-many pick that would need a
 * tie-break rule the schema has already made impossible to reach.
 */
export function activeSprintOf(sprints: Sprint[]): Sprint | null {
  return sprints.find((sprint) => sprint.state === "active") ?? null;
}

/** `activeSprintOf`'s id, which is what every caller but Sprint Details wants. */
export function activeSprintIdOf(sprints: Sprint[]): string | null {
  return activeSprintOf(sprints)?.id ?? null;
}
