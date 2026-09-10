import { supabase } from "../api/supabase";
import { TODO_LIST_FIELDS } from "../todos/todoApi";

// No board filter needed — every todos/activities SELECT policy is already scoped to accessible_board_ids(),
// so an unscoped query here returns exactly what this user can see, and Postgres applies limit() to that set.

export const FEED_PAGE = 25;

export async function fetchAssignedTodos(userId: string, limit = FEED_PAGE) {
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_LIST_FIELDS)
    .eq("assignee_id", userId)
    // top-level only — a subtask row means nothing in this feed without its parent
    .is("parent_id", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  return data;
}

export async function fetchRecentTodos(limit = FEED_PAGE) {
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_LIST_FIELDS)
    // top-level only, and applied before limit() — otherwise a busy task's subtasks crowd out real work
    .is("parent_id", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  return data;
}

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
    // rows arrive newest-first, so the first sighting of an id is its latest activity
    if (row.entity_id && !newest.has(row.entity_id)) {
      newest.set(row.entity_id, row.created_at);
    }
  }

  return newest;
}

export async function fetchTodosByIds(ids: string[]) {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("todos")
    .select(TODO_LIST_FIELDS)
    .in("id", ids)
    .is("parent_id", null);

  if (error) throw error;

  return data;
}
