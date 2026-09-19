import { api } from "@/services/api/client";
import type { IColumn } from "@/types/data";
import type { ColumnCategory } from "@/constants/columns";

export function getColumns(boardId: string): Promise<IColumn[]> {
  return api.get<IColumn[]>(`/boards/${boardId}/columns`);
}

// The append rank is computed server-side now, so creating no longer costs a
// read of the last column first.
export function createColumn({
  title,
  category,
  board_id,
}: {
  title: string;
  category: ColumnCategory;
  board_id: string;
}): Promise<IColumn> {
  return api.post<IColumn>(`/boards/${board_id}/columns`, { title, category });
}

// One row, not a whole-board renumber — two people reordering at once would otherwise overwrite each other.
export async function moveColumnRank({
  id,
  rank,
}: {
  id: string;
  boardId: string;
  rank: number;
}): Promise<void> {
  await api.post<void>(`/columns/${id}/move`, { rank });
}

export async function rebalanceBoardColumnRanks(boardId: string): Promise<void> {
  await api.post<{ rebalanced: number }>(`/boards/${boardId}/columns/rebalance`);
}

export function updateColumn({
  id,
  ...patch
}: Pick<IColumn, "id"> &
  Partial<Pick<IColumn, "title" | "min_limit" | "max_limit">>): Promise<IColumn> {
  return api.patch<IColumn>(`/columns/${id}`, patch);
}

// One transaction server-side, not four round trips — a dropped connection mid-way used to leave cards orphaned or a column stuck half-deleted.
export async function deleteColumn({
  id,
  moveToColumnId,
}: {
  id: string;
  moveToColumnId: string;
}) {
  await api.del<void>(`/columns/${id}`, { moveToColumnId });

  return { id, moveToColumnId };
}
