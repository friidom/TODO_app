import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/services/queryClient/queryKeys";
import type { IColumn, Todo } from "@/types/data";
import { useBoardId } from "@/hooks/useBoardId";
import { useDoneFlash } from "@/stores/doneFlash";
import { isGenuineSubtask } from "./subtasks";
import { useTodoDrop } from "./useTodoDrop";

// Goes through useTodoDrop, not a bare column update — that's what computes a rank meaningful at the destination instead of carrying over the old slot.
export function useMoveTodo(todoId: string) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const drop = useTodoDrop();
  const flashDone = useDoneFlash((state) => state.flash);

  return function moveTo(column: IColumn) {
    // read at click time, not via useTodos() — avoids an observer per row for an array only the click needs
    const todos =
      queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

    const activeTodo = todos.find((todo) => todo.id === todoId);

    if (!activeTodo || activeTodo.column_id === column.id) return;

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
