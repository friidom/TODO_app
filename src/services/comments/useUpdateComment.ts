import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateComment } from "./commentsApi";
import { applyCommentUpdated } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Comment } from "@/types/data";

// the DB grants update(content) alone — this only ever patches text, matching what the server would actually accept
export function useUpdateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      content,
    }: {
      id: string;
      content: string;
      todoId: string;
    }) => updateComment({ id, content }),

    onMutate: async ({ id, content, todoId }) => {
      const key = queryKeys.comments(todoId);

      await queryClient.cancelQueries({ queryKey: key });

      const previousComments = queryClient.getQueryData<Comment[]>(key) ?? [];

      const editing = previousComments.find((comment) => comment.id === id);

      if (editing) {
        queryClient.setQueryData<Comment[]>(
          key,
          applyCommentUpdated(previousComments, { ...editing, content }),
        );
      }

      return { previousComments, key };
    },

    onError: (_err, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.key, context.previousComments);
      }
    },

    // waits for the server row so the "edited" marker (from updated_at) doesn't appear before the edit is durable
    onSuccess: (serverComment, { todoId }) => {
      queryClient.setQueryData<Comment[]>(
        queryKeys.comments(todoId),
        (old = []) => applyCommentUpdated(old, serverComment),
      );
    },
  });
}
