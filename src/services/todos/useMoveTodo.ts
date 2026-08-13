import type { IColumn } from "@/types/data";
import { useDoneFlash } from "@/stores/doneFlash";
import { useUpdateTodoColumn } from "./useUpdateTodoColumn";

/**
 * Move one card to another column.
 *
 * Status is not a field on `todos` — it is which column the card is in, so
 * "change status" is the same operation a drag performs and goes through the
 * same `useUpdateTodoColumn` mutation. There is no second write path and no SQL
 * of its own.
 *
 * The done-flash lives here rather than at either call site because it is the
 * part that is easy to get wrong: a drag into a done column rings the card, and
 * every other way of moving it there has to ring it too or the feedback becomes
 * a property of how you moved the card rather than of where it landed.
 */
export function useMoveTodo(todoId: string) {
  const updateTodoColumn = useUpdateTodoColumn();
  const flashDone = useDoneFlash((state) => state.flash);

  return function moveTo(column: IColumn) {
    updateTodoColumn.mutate({ id: todoId, column_id: column.id });

    if (column.category === "done") flashDone(todoId);
  };
}
