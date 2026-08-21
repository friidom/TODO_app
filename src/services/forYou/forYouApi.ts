import { supabase } from "../api/supabase";
import { TODO_LIST_FIELDS } from "../todos/todoApi";

/**
 * The personal hub's queries (M21).
 *
 * **Every one of these is filtered server-side, and none of them fetches a
 * board.** The obvious implementation — `useScopedTodos({kind: "all"})`, then
 * sort and slice in the browser — is the one the brief rules out, and it would
 * deserve to be: it is one request per board, returning every card on every one
 * of them, to render twenty rows.
 *
 * **RLS is what makes an unscoped `from("todos")` correct here.** Every SELECT
 * policy on `todos` and `activities` is `board_id in (select
 * accessible_board_ids())` (see `20260806100619_rls_board_ownership.sql`), so a
 * query with no board filter already returns exactly the rows this user may
 * see — and `.order().limit()` is then applied by Postgres to that filtered
 * set, not to everything. Adding a client-side board filter on top would be
 * slower and would not make it safer; the one thing it *would* do is create a
 * second definition of "which boards can I see", which is the failure the
 * `accessible_board_ids()` helper exists to prevent.
 *
 * `TODO_LIST_FIELDS` rather than `select("*")`, so a row from this page has the
 * same shape as a row on a board and can be handed to the same components.
 */

/**
 * How many rows a tab asks for.
 *
 * A feed, not an inbox: nobody scrolls to the fiftieth thing they touched last
 * month, and the number that matters bounds the *query* rather than the render.
 * No pagination behind it, deliberately — a "load more" is a cursor, a merge
 * and an empty state, and the honest v1 is a recent-work feed that says
 * "recent". Same reasoning, and same shape, as `ACTIVITY_PAGE`.
 */
export const FEED_PAGE = 25;

/**
 * Work items assigned to one person, most recently touched first.
 *
 * The only tab with a genuinely indexed answer: `assignee_id` is an equality
 * filter Postgres applies before the sort.
 */
export async function fetchAssignedTodos(userId: string, limit = FEED_PAGE) {
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_LIST_FIELDS)
    .eq("assignee_id", userId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  return data;
}

/**
 * The most recently updated work anywhere the caller can reach.
 *
 * The backbone of Recommended. `updated_at` is trigger-maintained on `todos`
 * (`20260806093353_timestamps.sql`), so this is genuinely "what moved lately"
 * rather than "what was created lately".
 */
export async function fetchRecentTodos(limit = FEED_PAGE) {
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_LIST_FIELDS)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  return data;
}

/**
 * Which work items this person has acted on, most recent first.
 *
 * **`activities.actor_id` is the existing record of "I did this"** — written by
 * the three trigger functions in `20260815090000_create_activities.sql`, never
 * by the client, which is the property that makes it trustworthy. Nothing new
 * is being tracked for this page.
 *
 * It returns ids and instants rather than rows because the table stores an
 * `entity_id`, not a join. One activity per work item — the newest — since a
 * card edited nine times is one thing you worked on, not nine.
 *
 * The limit is raised over `FEED_PAGE` deliberately: these collapse by
 * `entity_id`, so N activities can be far fewer than N work items, and asking
 * for exactly a page would routinely return half of one.
 */
export async function fetchWorkedOn(userId: string, limit = FEED_PAGE * 4) {
  const { data, error } = await supabase
    .from("activities")
    .select("entity_id, created_at")
    .eq("actor_id", userId)
    .eq("entity_type", "todo")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const newest = new Map<string, string>();

  for (const row of data ?? []) {
    // Rows arrive newest-first, so the first sighting of an id is its latest
    // activity and every later one is history.
    if (row.entity_id && !newest.has(row.entity_id)) {
      newest.set(row.entity_id, row.created_at);
    }
  }

  return newest;
}

/**
 * Work items by id, in no particular order.
 *
 * The second half of the two-step tabs — Worked on and Viewed both start from a
 * list of ids and need the rows behind them. **RLS is doing real work here**:
 * an id from a board the caller has since lost access to simply does not come
 * back, which is exactly how a stale localStorage view list stops being visible
 * without any client-side filtering. The caller re-orders by its own
 * timestamps.
 *
 * Returns nothing for an empty input rather than issuing `in.()`, which
 * PostgREST rejects.
 */
export async function fetchTodosByIds(ids: string[]) {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("todos")
    .select(TODO_LIST_FIELDS)
    .in("id", ids);

  if (error) throw error;

  return data;
}
