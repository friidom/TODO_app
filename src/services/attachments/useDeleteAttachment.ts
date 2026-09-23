import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteAttachment } from "./attachmentsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Attachment } from "@/types/data";

// One request: the endpoint removes the object before the row, so a failure
// part-way leaves a visible row rather than bytes nothing points at.
export function useDeleteAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ todoId, id }: { id: string; todoId: string }) =>
      deleteAttachment(todoId, id),

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
