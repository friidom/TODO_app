import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addComment } from "./commentsApi";
import { applyCommentInserted, applyCommentUpdated } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useAuth } from "@/services/auth/useAuth";
import { useBoardId } from "@/hooks/useBoardId";
import type { Comment } from "@/types/data";

interface AddCommentVars {
  todoId: string;
  content: string;
}

/** `AddCommentVars` once the hook has stamped the client-minted id on. */
type AddCommentInput = AddCommentVars & { id: string };

/**
 * Post a comment on one work item, optimistically (M7-02).
 *
 * **The author and the board come from context, not from the caller.** M7-03's
 * composer knows the text and the task and should not have to know either — and
 * more importantly, an `author_id` a component passes in is an `author_id` a
 * component can get wrong, where the one read here is the session's. The INSERT
 * policy checks it against `auth.uid()` regardless, so a mistake is a refused
 * write rather than a forged comment; this just means there is nothing to
 * refuse.
 */
export function useAddComment() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const { user } = useAuth();

  const mutation = useMutation({
    mutationFn: ({ id, todoId, content }: AddCommentInput) => {
      if (!boardId) throw new Error("useAddComment ran without a board");
      if (!user) throw new Error("useAddComment ran without a session");

      return addComment({
        id,
        board_id: boardId,
        todo_id: todoId,
        author_id: user.id,
        content,
      });
    },

    onMutate: async ({ id, todoId, content }) => {
      // Both are required columns with no default, so refusing here states the
      // requirement rather than inventing a value for it. `onMutate` runs
      // before `mutationFn`, so this fails the mutation before anything
      // reaches the cache.
      if (!boardId) throw new Error("useAddComment ran without a board");
      if (!user) throw new Error("useAddComment ran without a session");

      const key = queryKeys.comments(todoId);

      await queryClient.cancelQueries({ queryKey: key });

      const previousComments = queryClient.getQueryData<Comment[]>(key) ?? [];

      // Carries the id the row will really have, so `onSuccess` reconciles
      // onto this comment rather than appending a second one — and so M7-04's
      // echo of it is an identity match.
      const optimisticComment: Comment = {
        id,
        board_id: boardId,
        todo_id: todoId,
        author_id: user.id,
        content,
        // The server stamps both. This is a guess at `created_at` only so the
        // comment sorts into place immediately; `onSuccess` replaces the row
        // with the server's, which is the one the "edited" marker reads.
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Comment[]>(
        key,
        applyCommentInserted(previousComments, optimisticComment),
      );

      return { previousComments, key };
    },

    onError: (_err, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.key, context.previousComments);
      }
    },

    onSuccess: (serverComment, { todoId }) => {
      // `applyCommentInserted` would leave the optimistic row alone — the id is
      // already there, which is the echo rule. This is the one place that
      // *wants* the server's copy, for the two timestamps it stamped.
      queryClient.setQueryData<Comment[]>(
        queryKeys.comments(todoId),
        (old = []) => applyCommentUpdated(old, serverComment),
      );
    },
  });

  // Minted here rather than in `onMutate` because `mutationFn` needs it too,
  // and context flows only forward — both receive the same variables, and
  // `onMutate` cannot add to them. Same shape as `useAddTodo`.
  const mutate = (variables: AddCommentVars) =>
    mutation.mutate({ ...variables, id: crypto.randomUUID() });

  return { ...mutation, mutate };
}
