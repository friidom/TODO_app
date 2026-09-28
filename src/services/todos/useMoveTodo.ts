import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/services/queryClient/queryKeys";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import { EMPTY_WORKFLOW, columnIdOf } from "@/services/workflow/statuses";
import type { IStatus, Todo } from "@/types/data";
import { useBoardId } from "@/hooks/useBoardId";
import { useDoneFlash } from "@/stores/doneFlash";
import { isGenuineSubtask } from "./subtasks";
import { useTodoDrop } from "./useTodoDrop";

// Goes through useTodoDrop, not a bare status update — that's what computes a rank meaningful at the destination instead of carrying over the old slot.
export function useMoveTodo(todoId: string) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const drop = useTodoDrop();
  const flashDone = useDoneFlash((state) => state.flash);
  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();

  return function moveTo(status: IStatus) {
    // read at click time, not via useTodos() — avoids an observer per row for an array only the click needs
    const todos =
      queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

    const activeTodo = todos.find((todo) => todo.id === todoId);

    if (!activeTodo || activeTodo.status_id === status.id) return;

    // Another status in the card's own column keeps its place; another column
    // takes it to the end, as a drop there would.
    const sameColumn =
      columnIdOf(activeTodo, workflow.statusById) === status.column_id;

    const index = todos.filter(
      (todo) =>
        columnIdOf(todo, workflow.statusById) === status.column_id &&
        todo.id !== todoId &&
        !isGenuineSubtask(todos, todo),
    ).length;

    drop.mutate({
      todos,
      activeTodo,
      columnId: status.column_id,
      statusId: status.id,
      index,
      rank:
        sameColumn && activeTodo.rank !== null ? activeTodo.rank : undefined,
    });

    if (status.category === "done") flashDone(todoId);
  };
}
