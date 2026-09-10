import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteComment } from "./commentsApi";
import { applyCommentDeleted } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Comment } from "@/types/data";

// No onSettled invalidation, unlike useDeleteTodo — a thread has no order to repair, so the row going is the whole update.
export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; todoId: string }) => deleteComment(id),

    onMutate: async ({ id, todoId }) => {
      const key = queryKeys.comments(todoId);

      await queryClient.cancelQueries({ queryKey: key });

      const previousComments = queryClient.getQueryData<Comment[]>(key) ?? [];

      queryClient.setQueryData<Comment[]>(key, (old = []) =>
        applyCommentDeleted(old, id),
      );

      return { previousComments, key };
    },

    onError: (_err, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.key, context.previousComments);
      }
    },
  });
}
