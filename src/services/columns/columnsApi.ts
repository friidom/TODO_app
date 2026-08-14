import { supabase } from "@/services/api/supabase";
import type { IColumn } from "@/types/data";
import type { ColumnCategory } from "@/constants/columns";

/**
 * Every column on one board.
 *
 * This query previously had no filter at all — it asked for every column row
 * in the database and relied entirely on RLS to cut it down. That worked only
 * because one user owned everything they could see.
 */
export async function getColumns(boardId: string): Promise<IColumn[]> {
  const { data, error } = await supabase
    .from("columns")
    .select("*")
    .eq("board_id", boardId)
    .order("position");

  if (error) throw error;

  return data;
}

export async function createColumn({
  title,
  category,
  board_id,
}: {
  title: string;
  category: ColumnCategory;
  board_id: string;
}) {
  // Scoped to the board, not the user: with more than one board, the tail
  // position of "everything this user owns" is the wrong number entirely.
  const { data: lastColumn } = await supabase
    .from("columns")
    .select("position")
    .eq("board_id", board_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (lastColumn?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("columns")
    .insert({
      title,
      category,
      board_id,
      position,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
//reorder columns
/**
 * `board_id` is in the payload for the same reason as reorderTodos: an upsert
 * is an INSERT for policy purposes, and a proposed row without board_id fails
 * both M2-08's WITH CHECK and M2-07's NOT NULL.
 */
export async function reorderColumns(columns: IColumn[], boardId: string) {
  const updates = columns.map((column) => ({
    id: column.id,
    position: column.position,
    board_id: boardId,
  }));

  const { error } = await supabase.from("columns").upsert(updates, {
    onConflict: "id",
  });

  if (error) throw error;
}

/** Rename, or set/clear the work-item limits. */
export async function updateColumn({
  id,
  ...patch
}: Pick<IColumn, "id"> &
  Partial<Pick<IColumn, "title" | "min_limit" | "max_limit">>) {
  const { data, error } = await supabase
    .from("columns")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data as IColumn;
}

/**
 * Rehomes the column's todos and drops it, in one transaction (M3-11).
 *
 * **One RPC, replacing four round trips.** This used to read the column's
 * todos, read the destination's last position, upsert the moved rows and then
 * delete the column — four requests with no transaction around them. A failure
 * or a lost connection between any two left the board in a state nothing
 * repaired: cards rehomed but the column still there, or worse, the column gone
 * while its cards still pointed at it. `delete_column` does all of it or none
 * of it.
 *
 * The ordering is identical, so nothing visible changes: the RPC appends after
 * the destination's last card preserving source order, which is exactly what
 * the client arithmetic computed. `useDeleteColumn` is untouched — same
 * arguments, same `{ id, moveToColumnId }` back.
 *
 * `SECURITY INVOKER`, deliberately: the caller's own RLS still applies, so it
 * inherits M3-05's editor-and-above gate for free rather than re-deriving it.
 * Two refusals the client path could not make legible — a destination on
 * another board, and a delete RLS silently matched zero rows — come back as
 * 42501 instead of a 23503 after the fact or a false success.
 */
export async function deleteColumn({
  id,
  moveToColumnId,
}: {
  id: string;
  moveToColumnId: string;
}) {
  const { error } = await supabase.rpc("delete_column", {
    p_column_id: id,
    p_move_to_column_id: moveToColumnId,
  });

  if (error) throw error;

  return { id, moveToColumnId };
}
