import type { ISupabaseTodo } from "../../../types/data";
// Extension is explicit: applyTodoDrop.check.ts runs this under
// `node --experimental-strip-types`, whose ESM resolver does not guess it.
import { byPosition } from "../position.ts";

/** Renumber a column from 0, as new objects. */
function renumber(columnTodos: ISupabaseTodo[]): ISupabaseTodo[] {
  return columnTodos.map((todo, position) => ({ ...todo, position }));
}

/**
 * The whole board after `activeTodo` is dropped at `index` of `columnId`.
 *
 * Both the destination and the column the card came from are renumbered,
 * because positions have to stay dense — a gap or a duplicate breaks the
 * column sort. Columns neither side of the move touched are passed through.
 *
 * Every returned row is a new object. The previous version renumbered with
 * `forEach` and assigned `todo.position` in place, which mutated the rows the
 * query cache was still holding: a snapshot taken for rollback pointed at
 * those same objects, so there would have been nothing left to roll back to.
 *
 * Pure, so the realtime handler in M6 can reuse it. See
 * `applyTodoDrop.check.ts`.
 */
export function applyTodoDrop(
  todos: ISupabaseTodo[],
  activeTodo: ISupabaseTodo,
  columnId: string,
  index: number,
): ISupabaseTodo[] {
  const remaining = todos.filter((todo) => todo.id !== activeTodo.id);

  const destination = remaining
    .filter((todo) => todo.column_id === columnId)
    .sort(byPosition);

  destination.splice(index, 0, { ...activeTodo, column_id: columnId });

  const others = remaining.filter((todo) => todo.column_id !== columnId);

  // Empty on a same-column drag: that column is the destination, so it was
  // already excluded above and the splice alone did the reordering.
  const source = others
    .filter((todo) => todo.column_id === activeTodo.column_id)
    .sort(byPosition);

  const untouched = others.filter(
    (todo) => todo.column_id !== activeTodo.column_id,
  );

  return [...untouched, ...renumber(source), ...renumber(destination)];
}
