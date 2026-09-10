import { supabase } from "@/services/api/supabase";
import type { IColumn } from "@/types/data";
import type { ColumnCategory } from "@/constants/columns";
import { rankForAppend } from "@/utils/rank";

export async function getColumns(boardId: string): Promise<IColumn[]> {
  const { data, error } = await supabase
    .from("columns")
    .select("*")
    .eq("board_id", boardId)
    .order("rank", { nullsFirst: false });

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
  const { data: lastColumn } = await supabase
    .from("columns")
    .select("position, rank")
    .eq("board_id", board_id)
    .order("rank", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const position = (lastColumn?.position ?? -1) + 1;
  const rank = rankForAppend(lastColumn ? [lastColumn] : []);

  const { data, error } = await supabase
    .from("columns")
    .insert({
      title,
      category,
      board_id,
      position,
      rank,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

// One row, not a whole-board renumber — two people reordering at once would otherwise overwrite each other.
export async function moveColumnRank({
  id,
  boardId,
  rank,
}: {
  id: string;
  boardId: string;
  rank: number;
}) {
  const { error } = await supabase
    .from("columns")
    .update({ rank })
    .eq("id", id)
    .eq("board_id", boardId);

  if (error) throw error;
}

export async function rebalanceBoardColumnRanks(boardId: string) {
  const { error } = await supabase.rpc("rebalance_board_column_ranks", {
    p_board_id: boardId,
  });

  if (error) throw error;
}

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

// One RPC transaction, not four round trips — a dropped connection mid-way used to leave cards orphaned or a column stuck half-deleted.
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
