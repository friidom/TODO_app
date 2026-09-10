import { supabase } from "../api/supabase";

const COMMENT_FIELDS =
  "id, board_id, todo_id, author_id, content, created_at, updated_at";

// Scoped by todo_id alone — the board is implied by the todo's own FK, so a board filter here could never disagree.
export async function fetchComments(todoId: string) {
  const { data, error } = await supabase
    .from("comments")
    .select(COMMENT_FIELDS)
    .eq("todo_id", todoId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data;
}

// id is minted by the caller so the optimistic row and the stored row are the same row.
export async function addComment({
  id,
  board_id,
  todo_id,
  author_id,
  content,
}: {
  id: string;
  board_id: string;
  todo_id: string;
  author_id: string;
  content: string;
}) {
  const { data, error } = await supabase
    .from("comments")
    .insert({ id, board_id, todo_id, author_id, content })
    .select(COMMENT_FIELDS)
    .single();

  if (error) throw error;

  return data;
}

// content is the only column the UPDATE grant allows — anything else gets refused with 42501.
export async function updateComment({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  const { data, error } = await supabase
    .from("comments")
    .update({ content })
    .eq("id", id)
    .select(COMMENT_FIELDS)
    .single();

  if (error) throw error;

  return data;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from("comments").delete().eq("id", id);

  if (error) throw error;

  return id;
}
