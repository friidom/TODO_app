import { supabase } from "../api/supabase";

/**
 * The columns a thread reads — every one of them, because the table has seven.
 *
 * Written out rather than `select("*")` for the reason `TODO_LIST_FIELDS`
 * records: the string literal is what `supabase-js` infers the row shape from,
 * so the list has to be a literal anyway, and naming it here is what makes
 * widening the row one edit instead of a search. Unlike the board's, this list
 * is not a narrowing — there is nothing on a comment the UI does not want.
 */
const COMMENT_FIELDS =
  "id, board_id, todo_id, author_id, content, created_at, updated_at";

/**
 * One work item's thread, oldest first.
 *
 * **Scoped by `todo_id` alone, and deliberately not by board as well.**
 * `fetchTodo` takes a board id because `?task=<id>` is user input and a foreign
 * task must not open inside this board's panel. A thread is not reached that
 * way: its `todoId` comes from a work item the panel has already resolved
 * against the board. And `comments.board_id` is not independent information —
 * the composite foreign key pins it to the work item's board — so a board
 * filter here could only ever agree with the row it is filtering.
 *
 * RLS is the boundary either way: a thread on a board the caller cannot read
 * returns empty rather than forbidden, which is the same non-answer the board
 * queries give.
 *
 * `created_at` ascending matches `comments_todo_created_idx`, so this is a
 * range scan under one work item with no sort node.
 */
export async function fetchComments(todoId: string) {
  const { data, error } = await supabase
    .from("comments")
    .select(COMMENT_FIELDS)
    .eq("todo_id", todoId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data;
}

/**
 * Post a comment.
 *
 * `id` is minted by the caller, as it is for work items (M2-14): the optimistic
 * row and the stored row are then the same row, so there is no pending-write
 * flag to keep, and M7-04's echo of this insert is an identity match against a
 * comment already in the cache rather than a second copy of it.
 *
 * `author_id` is sent explicitly. The column has no `auth.uid()` default —
 * `todos.creator_id` set that precedent — and the INSERT policy checks
 * `author_id = auth.uid()`, so a client that sends someone else's id is refused
 * by the database rather than trusted by it.
 *
 * An insert rather than an upsert. `addTodo` upserts because `reorderTodos` can
 * reach a still-pending row first and half-create it; nothing writes a comment
 * except this function, so there is no race to make idempotent.
 */
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

/**
 * Edit a comment's text.
 *
 * **`content` is the only field this can send, and that is a database rule
 * rather than a choice made here.** M7-01 grants `update (content)` and nothing
 * else, so a PATCH naming any other column is refused with 42501 — including
 * one that merely echoes an unchanged `board_id` back. The narrow signature is
 * what keeps a future caller from discovering that at runtime.
 *
 * `updated_at` is stamped by the `comments_set_updated_at` trigger, which is
 * why it is absent here and why the returned row is the one to trust for it.
 *
 * The UPDATE policy is author-only, so a comment somebody else wrote matches no
 * row and `single()` raises rather than returning null. That is the right
 * shape: an edit that silently changed nothing would look like it worked.
 */
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

/**
 * Remove a comment.
 *
 * Authors delete their own; admins and owners delete any. Both are one policy
 * and neither is expressed here — this function sends an id and the database
 * decides, which is the same division `deleteTodo` follows.
 *
 * Returns the id rather than the row, so the caller has the key it needs to
 * drop from the cache without holding a row that no longer exists.
 */
export async function deleteComment(id: string) {
  const { error } = await supabase.from("comments").delete().eq("id", id);

  if (error) throw error;

  return id;
}
