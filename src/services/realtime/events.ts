import {
  applyColumnDeleted,
  applyColumnInserted,
  applyColumnUpdated,
} from "@/services/columns/cache";
import {
  applyTodoDeleted,
  applyTodoInserted,
  applyTodoUpdated,
} from "@/services/todos/cache";
import type { IColumn, Todo } from "@/types/data";

/**
 * A replication event, turned into a cache transformation (M6-09).
 *
 * **Pure, and it calls the same `apply*` functions the mutations call.** That
 * reuse is the milestone's instruction and `docs/API.md`'s — *"Realtime should
 * later reuse the same cache update logic"* — and it is why those functions were
 * lifted out of the mutation closures in M2-16 in the first place. A second set
 * of transformations would be a second definition of what a move means.
 *
 * **Nothing here refetches**, which the plan states as a rule rather than a
 * preference: a board that refetches on every remote keystroke is a board that
 * costs more the more collaborative it gets, and the payload already carries the
 * whole row.
 *
 * Pure so it can be tested without a socket. `useBoardRealtime` is the only
 * caller and does nothing but hand the payload over and write the result.
 */

/**
 * The part of a Supabase payload this module uses.
 *
 * Declared structurally rather than imported from `@supabase/supabase-js` so the
 * tests can construct one from a literal. **`old` is deliberately partial**: the
 * two tables are `REPLICA IDENTITY DEFAULT`, so a DELETE carries the primary key
 * and nothing else. See the M6-07 migration for why it stays that way.
 */
export interface RowChange<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Partial<T>;
  old: Partial<T>;
}

/**
 * The board's work items after one event.
 *
 * **The echo rule, and it is one line: an INSERT whose id is already here is not
 * applied.** M2-14 made the client mint the uuid, so an event caused by *this*
 * client carries the same id as the row already in the cache — the identity
 * match the plan names, with no second mechanism, no origin header and no list
 * of pending writes to keep. It also makes a redelivered remote insert
 * idempotent, which is the same problem wearing a different hat.
 *
 * Skipping rather than replacing is deliberate for the local case: the optimistic
 * row holds the slot the user dropped it in, and `useAddTodo`'s own `onSuccess`
 * already reconciles it with the server's answer through `applyTodoConfirmed`.
 * Letting the echo overwrite it would move the card to wherever the server
 * appended it, which is the flicker M6-10's test list looks for.
 *
 * **An UPDATE for a row we do not have is dropped, not inserted.** It means the
 * INSERT was missed — a disconnection — and inventing the row from an UPDATE
 * payload would be a second convergence mechanism. `useBoardRealtime` resyncs
 * once on re-subscribe instead, which is the case that actually produces it.
 *
 * **A move arrives as an UPDATE and is applied as one.** `applyTodoMoved` is not
 * called here: it takes a column and a rank and rebuilds the row from the cached
 * copy, whereas an UPDATE payload carries the complete new row — including the
 * rank the sender chose, which is exactly what that function exists to preserve.
 * Whole-row replacement is strictly more correct, because a move that also
 * changed the title would otherwise lose the title.
 */
export function applyTodoEvent(todos: Todo[], change: RowChange<Todo>): Todo[] {
  if (change.eventType === "DELETE") {
    const id = change.old?.id;

    // No id means a payload we cannot act on rather than one we should guess
    // at. Deleting nothing is the safe reading.
    return id ? applyTodoDeleted(todos, id) : todos;
  }

  const row = change.new as Todo | undefined;

  if (!row?.id) return todos;

  const known = todos.some((todo) => todo.id === row.id);

  if (change.eventType === "INSERT") {
    return known ? todos : applyTodoInserted(todos, row);
  }

  return known ? applyTodoUpdated(todos, row) : todos;
}

/**
 * The board's columns after one event.
 *
 * Same three rules as the todos above. Columns are inserted by the server
 * rather than by the client — `useCreateColumn` patches the cache in
 * `onSuccess` with the row the insert returned, not optimistically — so the id
 * in an echo is the id already in the cache, and the identity match holds for
 * the same reason without the client minting anything.
 */
export function applyColumnEvent(
  columns: IColumn[],
  change: RowChange<IColumn>,
): IColumn[] {
  if (change.eventType === "DELETE") {
    const id = change.old?.id;

    return id ? applyColumnDeleted(columns, id) : columns;
  }

  const row = change.new as IColumn | undefined;

  if (!row?.id) return columns;

  const known = columns.some((column) => column.id === row.id);

  if (change.eventType === "INSERT") {
    return known ? columns : applyColumnInserted(columns, row);
  }

  return known ? applyColumnUpdated(columns, row) : columns;
}
