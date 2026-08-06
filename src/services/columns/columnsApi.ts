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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

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
      // Still sent: user_id remains the ownership column until M2-13.
      user_id: user.id,
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
 * Rehomes the column's todos before dropping it — appended to the end of the
 * destination so its existing positions stay dense.
 */
export async function deleteColumn({
  id,
  moveToColumnId,
}: {
  id: string;
  moveToColumnId: string;
}) {
  const { data: moving, error: movingError } = await supabase
    .from("todos")
    .select("id")
    .eq("column_id", id)
    .order("position", { ascending: true });

  if (movingError) throw movingError;

  if (moving?.length) {
    const { data: last, error: lastError } = await supabase
      .from("todos")
      .select("position")
      .eq("column_id", moveToColumnId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastError) throw lastError;

    const start = (last?.position ?? -1) + 1;

    const { error: moveError } = await supabase.from("todos").upsert(
      moving.map((todo, index) => ({
        id: todo.id,
        column_id: moveToColumnId,
        position: start + index,
      })),
      { onConflict: "id" },
    );

    if (moveError) throw moveError;
  }

  const { error } = await supabase.from("columns").delete().eq("id", id);

  if (error) throw error;

  return { id, moveToColumnId };
}
