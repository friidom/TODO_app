import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/services/queryClient/queryKeys";
import type { IColumn, Todo } from "@/types/data";
import { useBoardId } from "@/hooks/useBoardId";
import { useDoneFlash } from "@/stores/doneFlash";
import { isGenuineSubtask } from "./subtasks";
import { useTodoDrop } from "./useTodoDrop";

/**
 * Move one card to another column.
 *
 * Status is not a field on `todos` — it is which column the card is in, so
 * "change status" is the same operation a drag performs and goes through the
 * same `useTodoDrop` mutation. There is no second write path and no SQL of its
 * own.
 *
 * **It goes through the drop rather than a bare column update, and that is the
 * fix rather than a detail.** It used to call `useUpdateTodoColumn`, which
 * wrote `{ id, board_id, column_id }` and nothing else — so the card arrived in
 * its new column still carrying the order value it held in the old one, landing
 * in an arbitrary slot and sometimes tying with a card already there.
 * `useTodoDrop` is what computes a value that means something in the
 * destination: since M6-04 that is a rank between the two cards either side of
 * where it lands, written to that one row.
 *
 * The card lands at the END of the destination column. A menu has no gap to
 * aim at the way a drag does, and appending is the only answer that does not
 * invent an intent — it is also what dropping on an empty column already does.
 *
 * The done-flash lives here rather than at either call site because it is the
 * part that is easy to get wrong: a drag into a done column rings the card, and
 * every other way of moving it there has to ring it too or the feedback becomes
 * a property of how you moved the card rather than of where it landed.
 */
export function useMoveTodo(todoId: string) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const drop = useTodoDrop();
  const flashDone = useDoneFlash((state) => state.flash);

  return function moveTo(column: IColumn) {
    // Read at click time rather than subscribed with `useTodos()`. A
    // StatusControl renders once per card and once per list row, so a hook
    // there would add an observer per row for an array only this click needs —
    // and the value read here is the freshest one rather than the one from the
    // render that produced the handler.
    const todos =
      queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

    const activeTodo = todos.find((todo) => todo.id === todoId);

    // Nothing to move, or nothing to change. StatusControl already skips the
    // current column; this is the same guard where the caller is not looking.
    if (!activeTodo || activeTodo.column_id === column.id) return;

    // Visible cards only (M27, widened for Epics in M28-A). The cache holds
    // genuine Subtasks too, and they carry a real column, so counting them
    // here would append the card past the end of the visible column — a gap
    // index pointing at rows the board never drew. A Task under an Epic is
    // counted normally: it IS one of those rows.
    const index = todos.filter(
      (todo) =>
        todo.column_id === column.id &&
        todo.id !== todoId &&
        !isGenuineSubtask(todos, todo),
    ).length;

    drop.mutate({ todos, activeTodo, columnId: column.id, index });

    if (column.category === "done") flashDone(todoId);
  };
}
