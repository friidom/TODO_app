import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteAttachmentRow, removeObject } from "./attachmentsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Attachment } from "@/types/data";

// Object deleted before the row — the storage policy locates the object through the row, so deleting the row first would orphan the bytes permanently.
export function useDeleteAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      storagePath,
    }: {
      id: string;
      storagePath: string;
      todoId: string;
    }) => {
      await removeObject(storagePath);

      return deleteAttachmentRow(id);
    },

    onMutate: async ({ id, todoId }) => {
      const key = queryKeys.attachments(todoId);

      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<Attachment[]>(key) ?? [];

      queryClient.setQueryData<Attachment[]>(key, (old = []) =>
        old.filter((attachment) => attachment.id !== id),
      );

      return { previous, key };
    },

    onError: (_err, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
  });
}
