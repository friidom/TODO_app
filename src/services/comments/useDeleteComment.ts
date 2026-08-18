import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteComment } from "./commentsApi";
import { applyCommentDeleted } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Comment } from "@/types/data";

/**
 * Remove a comment, optimistically (M7-02).
 *
 * Who may is not decided here: an author reaches their own and an admin or
 * owner reaches any, and both are one DELETE policy. A failed delete rolls the
 * comment back into the thread, which is what a viewer trying to remove
 * somebody else's would see — the honest rendering of a database refusal
 * rather than a permission check duplicated in the client.
 *
 * No `onSettled` invalidation, unlike `useDeleteTodo`. That one invalidates
 * because deleting a card leaves the board's dense `position` values gapped and
 * the server's renumbering is the authority; a thread has no ordering to
 * repair, so a removal is complete the moment the row is gone.
 */
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
