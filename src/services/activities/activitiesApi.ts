import { supabase } from "../api/supabase";

// activities has no natural bound (no retention policy), so this caps the query, not just the render
export const ACTIVITY_PAGE = 50;

// read-only on purpose — no insert grant on this table, only the trigger functions write it
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
