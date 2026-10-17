import { useMutation, useQueryClient } from "@tanstack/react-query";

import { setAttachmentPinned } from "@/services/attachments/attachmentsApi";
import { setCommentPinned } from "@/services/comments/commentsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Attachment, Comment } from "@/types/data";
import { applyPinned } from "./pinned";

// Variables carry itemId, not id: the task header reads a write's work item
// from `id` or from the scope, and here only the scope names the work item.
type Toggle = { itemId: string; pinned: boolean };

function usePinToggle<T extends Comment | Attachment>(
  todoId: string,
  key: readonly unknown[],
  write: (toggle: Toggle) => Promise<T>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["todo-write"],
    scope: { id: `pins:${todoId}` },
    mutationFn: write,

    onMutate: async ({ itemId, pinned }) => {
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<T[]>(key);

      if (previous) {
        queryClient.setQueryData<T[]>(
          key,
          applyPinned(previous, itemId, pinned, new Date().toISOString()),
        );
      }

      return { previous };
    },

    onError: (_err, _toggle, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSuccess: (row) => {
      queryClient.setQueryData<T[]>(key, (old) =>
        old?.map((item) => (item.id === row.id ? row : item)),
      );
    },
  });
}

export function usePinComment(todoId: string) {
  return usePinToggle<Comment>(
    todoId,
    queryKeys.comments(todoId),
    ({ itemId, pinned }) => setCommentPinned(itemId, pinned),
  );
}

export function usePinAttachment(todoId: string) {
  return usePinToggle<Attachment>(
    todoId,
    queryKeys.attachments(todoId),
    ({ itemId, pinned }) => setAttachmentPinned(todoId, itemId, pinned),
  );
}
