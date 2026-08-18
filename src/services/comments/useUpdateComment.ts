import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateComment } from "./commentsApi";
import { applyCommentUpdated } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Comment } from "@/types/data";

/**
 * Edit a comment's text, optimistically (M7-02).
 *
 * `todoId` is a variable rather than something the hook reads, because the
 * cache entry is keyed by the work item and a comment row does not have to be
 * fetched to know which thread it is in — the caller is already rendering it.
 *
 * **Only the text changes here, and the database is what says so.** M7-01
 * grants `update (content)` alone, so this hook could not widen the write even
 * if a caller asked it to; the optimistic patch keeps the same discipline so
 * the cache never shows a field the server would have refused.
 */
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

      // Nothing to patch: the thread is not in cache, or the comment is not in
      // this thread. The write still goes out — the id is what identifies it —
      // and `onSuccess` will land the server row wherever it belongs.
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

    // The server row, for `updated_at` — the trigger stamped it, and it is what
    // an "edited" marker reads. Guessing it optimistically would mean the
    // marker appeared a moment before the edit was durable.
    onSuccess: (serverComment, { todoId }) => {
      queryClient.setQueryData<Comment[]>(
        queryKeys.comments(todoId),
        (old = []) => applyCommentUpdated(old, serverComment),
      );
    },
  });
}
