import { supabase } from "../api/supabase";

/**
 * How many entries the drawer holds (M18).
 *
 * The feed answers "what changed recently", and nobody reads the fiftieth line
 * of it — but the number that matters is the one bounding the *query*, not the
 * render. `activities` is the one table in the schema with no natural bound
 * (see the migration's retention section), so an unlimited select against a
 * board that has been busy for a year is a request that gets slower forever.
 *
 * No pagination behind it, deliberately. A "load more" is a real feature with a
 * cursor, a merge and an empty state, and nothing has asked for it — the honest
 * v1 is a recent-activity feed that says so.
 */
export const ACTIVITY_PAGE = 50;

/**
 * One board's history, newest first.
 *
 * **Read-only, and there is no companion write function on purpose.** The table
 * has no insert grant and no insert policy — the only writers are the three
 * trigger functions in `20260815090000_create_activities.sql`. An
 * `insertActivity` here would be a call that fails at the database and a
 * suggestion to the next reader that the client is allowed to log things, which
 * is exactly the property that makes the log trustworthy.
 *
 * Scoped by `board_id` and ordered on `(board_id, created_at desc)`, which is
 * the index the migration adds for this one query — a range scan under a board
 * with no sort node.
 *
 * Names are not joined. The feed resolves people through the roster the board
 * already has in cache (`board_roster`), so this query stays one table and one
 * index, and the actor's *current* name is what renders.
 */
export async function fetchActivities(boardId: string) {
  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, board_id, actor_id, entity_type, entity_id, action, payload, created_at",
    )
    .eq("board_id", boardId)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_PAGE);

  if (error) throw error;

  return data;
}

/**
 * One work item's own history, newest first (M25).
 *
 * **No `limit`, unlike the board feed.** One item's lifetime of activity is far
 * smaller than a board's — the same bound `ACTIVITY_PAGE` exists for — so the
 * trigger that made a page number necessary there does not apply here.
 *
 * `board_id` is in the predicate deliberately, not just `entity_id` — it is
 * what lets this query use `activities_board_entity_idx`
 * `(board_id, entity_id)` as a range scan rather than a full-index scan on
 * `entity_id` alone, which Postgres cannot do efficiently without it (the
 * column is not the index's leading one). `entity_type = 'todo'` is there for
 * correctness rather than selectivity — a work item's uuid will never collide
 * with a column's or a member's, but the filter states the assumption instead
 * of relying on it.
 */
export async function fetchTodoActivities(boardId: string, todoId: string) {
  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, board_id, actor_id, entity_type, entity_id, action, payload, created_at",
    )
    .eq("board_id", boardId)
    .eq("entity_type", "todo")
    .eq("entity_id", todoId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data;
}
