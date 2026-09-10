import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodo } from "./todoApi";
import { applyTodoUpdated } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo } from "../../types/data";
import { useBoardId } from "@/hooks/useBoardId";

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: updateTodo,

    onSuccess: (updatedTodo) => {
      queryClient.setQueryData(queryKeys.todos(boardId), (old: Todo[] = []) =>
        applyTodoUpdated(old, updatedTodo),
      );

      // invalidated, not patched — updatedTodo is the narrowed board shape, so merging it would blank the detail panel's description
      queryClient.invalidateQueries({
        queryKey: queryKeys.todo(updatedTodo.id),
      });

      // the activity trigger runs in the same statement, so the row already exists by the time this fires
      queryClient.invalidateQueries({
        queryKey: queryKeys.todoActivities(updatedTodo.id),
      });
    },
  });
}
