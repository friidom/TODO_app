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

      // The History/All tab's entry, if this item's modal is open (M25). The
      // trigger that turns this write into an activity row runs inside the
      // same statement, so by the time this callback fires the row already
      // exists — refetching now, rather than waiting on a poll, is what makes
      // an edit's own history entry appear without reopening the panel. A
      // no-op when the tab is closed or on a different item.
      queryClient.invalidateQueries({
        queryKey: queryKeys.todoActivities(updatedTodo.id),
      });
    },
  });
}
