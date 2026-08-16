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
