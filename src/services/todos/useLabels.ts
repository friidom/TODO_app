import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo, TodoDetail } from "@/types/data";
import { applyDetailPatched, applyTodoPatched } from "./cache";
import { labelsOf, withLabel, withoutLabel } from "./labels";
import { addLabel, removeLabel } from "./todoApi";

type Change = { name: string; on: boolean };

// One scope per card: an add and a remove clicked in quick succession reach
// the server in the order they were made.
export function useLabelChange(todoId: string) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationKey: ["todo-write"],
    scope: { id: `labels:${todoId}` },
    mutationFn: ({ name, on }: Change) =>
      on ? addLabel(todoId, name) : removeLabel(todoId, name),

    onMutate: async ({ name, on }) => {
      const listKey = queryKeys.todos(boardId);
      const detailKey = queryKeys.todo(todoId);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: detailKey }),
      ]);

      const previousTodos = queryClient.getQueryData<Todo[]>(listKey);
      const previousDetail = queryClient.getQueryData<TodoDetail>(detailKey);

      const next = (labels: string[]) =>
        on ? withLabel(labels, name) : withoutLabel(labels, name);

      if (previousTodos) {
        const row = previousTodos.find((todo) => todo.id === todoId);

        if (row) {
          queryClient.setQueryData<Todo[]>(
            listKey,
            applyTodoPatched(previousTodos, todoId, {
              labels: next(labelsOf(row)),
            }),
          );
        }
      }

      if (previousDetail) {
        queryClient.setQueryData<TodoDetail>(
          detailKey,
          applyDetailPatched(previousDetail, todoId, {
            labels: next(labelsOf(previousDetail)),
          }),
        );
      }

      return { previousTodos, previousDetail };
    },

    onError: (_err, _change, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(
          queryKeys.todos(boardId),
          context.previousTodos,
        );
      }

      if (context?.previousDetail) {
        queryClient.setQueryData(
          queryKeys.todo(todoId),
          context.previousDetail,
        );
      }
    },

    onSuccess: (row) => {
      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old) =>
        old ? applyTodoPatched(old, todoId, { labels: labelsOf(row) }) : old,
      );

      queryClient.invalidateQueries({
        queryKey: queryKeys.todoActivities(todoId),
      });
    },

    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.todo(todoId) }),
  });
}
