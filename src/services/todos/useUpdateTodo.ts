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

      // The detail panel's entry, if one is open (M5-06). Invalidated rather
      // than patched: the row this mutation returns is the narrowed board
      // shape, so merging it into the full row would leave `description`
      // showing its pre-edit value — which is the one field the panel exists
      // to edit. A no-op when the panel is closed, since the query has no
      // observer and nothing refetches.
      queryClient.invalidateQueries({
        queryKey: queryKeys.todo(updatedTodo.id),
      });
    },
  });
}
