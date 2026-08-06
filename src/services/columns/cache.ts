import type { IColumn } from "@/types/data";
import { byPosition } from "@/utils/position";

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
    .sort(byPosition)
    .map((column, position) => ({ ...column, position }));
}

/**
 * The columns with the one at `from` moved to `to`, renumbered.
 *
 * Sorts first so the indices mean the same thing whatever order the cache
 * happens to hold — the two drag paths in `KanbanBoard` pass an already-sorted
 * list, but a realtime handler reading straight from the cache does not.
 *
 * An out-of-range `from` returns the input untouched. The callers guard
 * against it already; the alternative is splicing `undefined` into the board.
 */
export function applyColumnMoved(
  columns: IColumn[],
  from: number,
  to: number,
): IColumn[] {
  const next = [...columns].sort(byPosition);
  const [moved] = next.splice(from, 1);

  if (!moved) return columns;

  next.splice(to, 0, moved);

  return next.map((column, position) => ({ ...column, position }));
}
