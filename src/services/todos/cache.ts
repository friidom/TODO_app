import type { ISupabaseTodo } from "@/types/data";
import { byPosition } from "@/utils/position";
import { insertDense } from "./insertDense";

/**
 * Every way the `["todos", boardId]` cache entry changes, as pure functions.
 *
 * They used to live inside the `onMutate`/`onSuccess` closures of the mutation
 * hooks, which made them unreachable from anywhere else. M6's realtime channel
 * has to apply the same transformations to the same array when the change
 * arrives from another client, and `docs/API.md` asks for exactly that reuse:
 * *"Realtime should later reuse the same cache update logic."*
 *
 * The rules every function here follows:
 *
 * - `(todos, …) => todos` — the whole board in, the whole board out. The cache
 *   holds one flat array for the board, not one entry per column.
 * - No mutation of the input, and a new object for every row whose `position`
 *   changed. `onMutate` snapshots the cached array for rollback, and the cache
 *   holds these very objects: renumbering in place would corrupt the snapshot
 *   and leave `onError` nothing to restore.
 * - Rows nothing touched are passed through by reference, so React can skip
 *   re-rendering them.
 */

/** Renumber a column from 0, as new objects. */
function renumber(columnTodos: ISupabaseTodo[]): ISupabaseTodo[] {
  return columnTodos.map((todo, position) => ({ ...todo, position }));
}

/**
 * The board with `todo` added to its own column at `index`, appended when the
 * index is omitted. The destination is renumbered so positions stay dense.
 */
export function applyTodoInserted(
  todos: ISupabaseTodo[],
  todo: ISupabaseTodo,
  index?: number,
): ISupabaseTodo[] {
  const destination = todos.filter((it) => it.column_id === todo.column_id);
  const untouched = todos.filter((it) => it.column_id !== todo.column_id);

  return [...untouched, ...insertDense(destination, todo, index)];
}

/**
 * The board with the pending row replaced by the row the server wrote back.
 *
 * Since M2-14 the client mints the uuid, so this matches on `serverTodo.id`
 * alone — before that it took the fake optimistic id as a third argument,
 * because the server's id was a different number entirely.
 *
 * Client-only — the realtime handler has no pending row to reconcile, so this
 * one has no M6 caller. It is here because the slot-keeping rule is the subtle
 * part: the server appends to the end of the column, but the user dropped the
 * card at a chosen gap, so the position picked optimistically wins and
 * `useAddTodo` writes the corrected order back afterwards.
 *
 * An id matching nothing returns the board unchanged, which is what the old
 * inline `map` did.
 */
export function applyTodoConfirmed(
  todos: ISupabaseTodo[],
  serverTodo: ISupabaseTodo,
): ISupabaseTodo[] {
  const position =
    todos.find((todo) => todo.id === serverTodo.id)?.position ??
    serverTodo.position;

  return todos.map((todo) =>
    todo.id === serverTodo.id ? { ...serverTodo, position } : todo,
  );
}

/**
 * The board with `row` in place of the row that shares its id.
 *
 * A whole-row replacement rather than a merge: both callers — `updateTodo`'s
 * response and an M6 `UPDATE` payload — carry the complete row, so the server's
 * answer is the whole answer and a merge could only keep something staler.
 */
export function applyTodoUpdated(
  todos: ISupabaseTodo[],
  row: ISupabaseTodo,
): ISupabaseTodo[] {
  return todos.map((todo) => (todo.id === row.id ? row : todo));
}

/**
 * The board without the row `id`.
 *
 * The gap in the source column's positions is left alone deliberately.
 * `useDeleteTodo` invalidates in `onSettled`, so the server's numbering
 * arrives moments later, and renumbering here would only be a second answer
 * that has to agree with it.
 */
export function applyTodoDeleted(
  todos: ISupabaseTodo[],
  id: ISupabaseTodo["id"],
): ISupabaseTodo[] {
  return todos.filter((todo) => todo.id !== id);
}

/**
 * The board after `activeTodo` lands at `index` of `columnId`.
 *
 * Both the destination and the column the card came from are renumbered,
 * because positions have to stay dense — a gap or a duplicate breaks the
 * column sort. Columns neither side of the move touched are passed through.
 */
export function applyTodoMoved(
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
