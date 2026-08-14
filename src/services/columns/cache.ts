import type { IColumn } from "@/types/data";
import { byRank } from "@/utils/rank";

/**
 * Every way the `["columns", boardId]` cache entry changes, as pure functions.
 *
 * The column half of `services/todos/cache.ts` — same contract, same reasons:
 * the mutation hooks call these today and M6's realtime channel calls the same
 * ones when the change arrives from another client. No input is mutated, and
 * a row whose `position` changed comes back as a new object.
 */

/**
 * The board's columns with `column` added.
 *
 * Appended unsorted: `createColumn` gives the new column the tail position, so
 * the array is already in order, and `KanbanBoard` sorts by position anyway.
 */
export function applyColumnInserted(
  columns: IColumn[],
  column: IColumn,
): IColumn[] {
  return [...columns, column];
}

/**
 * The columns with `patch` merged into the one sharing its id.
 *
 * A merge rather than a replacement, because the caller sends only the fields
 * it changed — a rename does not carry the limits. A complete row satisfies
 * the same signature, so the M6 handler can pass one straight through.
 */
export function applyColumnUpdated(
  columns: IColumn[],
  patch: Pick<IColumn, "id"> & Partial<IColumn>,
): IColumn[] {
  return columns.map((column) =>
    column.id === patch.id ? { ...column, ...patch } : column,
  );
}

/** The columns without `id`, renumbered to close the gap it left behind. */
export function applyColumnDeleted(
  columns: IColumn[],
  id: IColumn["id"],
): IColumn[] {
  return columns
    .filter((column) => column.id !== id)
    .sort(byRank)
    .map((column, position) => ({ ...column, position }));
}
