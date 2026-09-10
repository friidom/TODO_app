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

type AddCommentInput = AddCommentVars & { id: string };

// author_id comes from the session, not the caller — the INSERT policy checks auth.uid() regardless, so there's nothing to forge.
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
      if (!boardId) throw new Error("useAddComment ran without a board");
      if (!user) throw new Error("useAddComment ran without a session");

      const key = queryKeys.comments(todoId);

      await queryClient.cancelQueries({ queryKey: key });

      const previousComments = queryClient.getQueryData<Comment[]>(key) ?? [];

      const optimisticComment: Comment = {
        id,
        board_id: boardId,
        todo_id: todoId,
        author_id: user.id,
        content,
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
      // swap in the server row for its timestamps — applyCommentInserted alone would leave the optimistic guess in place
      queryClient.setQueryData<Comment[]>(
        queryKeys.comments(todoId),
        (old = []) => applyCommentUpdated(old, serverComment),
      );
    },
  });

  const mutate = (variables: AddCommentVars) =>
    mutation.mutate({ ...variables, id: crypto.randomUUID() });

  return { ...mutation, mutate };
}
