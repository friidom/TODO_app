import type { IColumn } from "@/types/data";
import { byRank } from "@/utils/rank";

// mutation hooks and the realtime channel both call these — never mutates input, a changed row comes back as a new object

export function applyColumnInserted(
  columns: IColumn[],
  column: IColumn,
): IColumn[] {
  return [...columns, column];
}

// merge, not replace — caller may only send the fields that changed
export function applyColumnUpdated(
  columns: IColumn[],
  patch: Pick<IColumn, "id"> & Partial<IColumn>,
): IColumn[] {
  return columns.map((column) =>
    column.id === patch.id ? { ...column, ...patch } : column,
  );
}

export function applyColumnDeleted(
  columns: IColumn[],
  id: IColumn["id"],
): IColumn[] {
  return columns
    .filter((column) => column.id !== id)
    .sort(byRank)
    .map((column, position) => ({ ...column, position }));
}
