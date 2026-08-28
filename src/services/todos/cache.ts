import type { Todo } from "@/types/data";
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

/**
 * The board with `todo` added to its own column at `index`, appended when the
 * index is omitted. The destination is renumbered so positions stay dense.
 */
export function applyTodoInserted(
  todos: Todo[],
  todo: Todo,
  index?: number,
): Todo[] {
  const destination = todos.filter((it) => it.column_id === todo.column_id);
  const untouched = todos.filter((it) => it.column_id !== todo.column_id);

  return [...untouched, ...insertDense(destination, todo, index)];
}

/**
 * The board with a subtask added (M27).
 *
 * **Appended, never bucketed.** `applyTodoInserted` above splits the array by
 * `column_id` and hands the destination to `insertDense`, which renumbers
 * every card in that column so the dense positions stay dense. A subtask
 * carries a real `column_id` — that is what gives it a status — but it is not
 * *in* the column in the sense that renumbering means: it is never drawn
 * there, never dragged there, and its position competes with nothing. Sending
 * it through the same function would rewrite the positions of every card
 * around it to make room for a row the board does not show.
 *
 * The echo rule is the same one `applyCommentInserted` follows and for the
 * same reason: the client mints the uuid, so a realtime insert caused by this
 * client carries an id already here, and adding it twice is what the identity
 * check prevents.
 */
export function applySubtaskInserted(todos: Todo[], subtask: Todo): Todo[] {
  if (todos.some((todo) => todo.id === subtask.id)) return todos;

  return [...todos, subtask];
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
export function applyTodoConfirmed(todos: Todo[], serverTodo: Todo): Todo[] {
  const pending = todos.find((todo) => todo.id === serverTodo.id);

  const position = pending?.position ?? serverTodo.position;

  // The rank is kept for the same reason the position is (M6-A): `addTodo`
  // always appends, but the user may have created the card at a chosen gap, so
  // the slot the client picked wins and `useAddTodo` writes it back. Without
  // this the card would visibly jump to the bottom the instant the server
  // answered.
  const rank = pending?.rank ?? serverTodo.rank;

  return todos.map((todo) =>
    todo.id === serverTodo.id ? { ...serverTodo, position, rank } : todo,
  );
}

/**
 * The board with `row` in place of the row that shares its id.
 *
 * A whole-row replacement rather than a merge: both callers — `updateTodo`'s
 * response and an M6 `UPDATE` payload — carry the complete row, so the server's
 * answer is the whole answer and a merge could only keep something staler.
 */
export function applyTodoUpdated(todos: Todo[], row: Todo): Todo[] {
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
export function applyTodoDeleted(todos: Todo[], id: Todo["id"]): Todo[] {
  return todos.filter((todo) => todo.id !== id);
}

/**
 * The board after `activeTodo` lands in `columnId` at `rank`.
 *
 * **One row changes** (M6-04). It used to renumber the destination column and
 * the source column, because dense positions had to stay dense — which is the
 * behaviour that made two editors overwrite each other: each client renumbered
 * from its own snapshot, the whole array was written, and last write won,
 * including for cards the second editor never touched.
 *
 * A rank is a value the card carries, not a place in a sequence, so a move is a
 * single field on a single row and every other card is passed through **by
 * reference** — which also means React re-renders exactly the card that moved.
 *
 * It takes the rank rather than computing one because the sender already chose
 * it, and recomputing on the receiving side would put the card somewhere else
 * on every client.
 *
 * **M6-B does not call this, and the prediction that it would was wrong.** A
 * remote move arrives as an UPDATE carrying the *complete* new row — the new
 * column, the sender's rank and every other field — so `applyTodoUpdated` is
 * strictly more correct there: rebuilding the row from the cached copy would
 * lose a rename that travelled with the move. This is the local drag path's
 * function, and the drag path is its only caller.
 */
export function applyTodoMoved(
  todos: Todo[],
  activeTodo: Todo,
  columnId: string,
  rank: number,
): Todo[] {
  return todos.map((todo) =>
    todo.id === activeTodo.id ? { ...todo, column_id: columnId, rank } : todo,
  );
}

/**
 * The board after a Backlog-page drag lands `todoId` at `patch` — the
 * `sprint_id`/`column_id`/`rank`/`backlog_rank` fields `sprintAssignmentPatch`
 * decided for the drop.
 *
 * **`applyTodoMoved`'s counterpart for the Backlog's own drag path, not a
 * reuse of it.** A Board drag always writes exactly `column_id` and `rank`;
 * a Backlog drag's write shape depends on the drop — same-section is
 * `backlog_rank` alone, a cross-Sprint move adds `sprint_id`, and entering
 * the board's active Sprint with no column yet adds `column_id`/`rank` too
 * (`sprintAssignmentPatch`'s own branches). Accepting the patch rather than
 * fixed parameters is what lets one function answer to all of them without
 * a same-shaped sibling for each branch.
 */
export function applyBacklogMoved(
  todos: Todo[],
  todoId: string,
  patch: Partial<Pick<Todo, "sprint_id" | "column_id" | "rank" | "backlog_rank">>,
): Todo[] {
  return todos.map((todo) =>
    todo.id === todoId ? { ...todo, ...patch } : todo,
  );
}
