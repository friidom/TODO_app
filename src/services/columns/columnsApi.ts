import { supabase } from "@/services/api/supabase";
import type { IColumn } from "@/types/data";
import type { ColumnCategory } from "@/constants/columns";

export async function getColumns(): Promise<IColumn[]> {
  const { data, error } = await supabase
    .from("columns")
    .select("*")
    .order("position");

  if (error) throw error;

  return data;
}

export async function createColumn({
  title,
  category,
}: {
  title: string;
  category: ColumnCategory;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data: lastColumn } = await supabase
    .from("columns")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (lastColumn?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("columns")
    .insert({
      title,
      category,
      user_id: user.id,
      position,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
//reorder columns
export async function reorderColumns(columns: IColumn[]) {
  const updates = columns.map((column) => ({
    id: column.id,
    position: column.position,
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
