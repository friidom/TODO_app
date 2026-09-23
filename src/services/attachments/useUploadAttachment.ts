import { useMutation, useQueryClient } from "@tanstack/react-query";

import { uploadAttachment } from "./attachmentsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

interface UploadAttachmentVars {
  todoId: string;
  file: File;
}

// Not optimistic — AttachmentsSection renders in-flight rows from local state
// so several files can upload and fail independently.
export function useUploadAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    // Silent: AttachmentsSection renders its own per-file error row with Retry,
    // and the global toast would duplicate it.
    meta: { silent: true },

    mutationFn: ({ todoId, file }: UploadAttachmentVars) =>
      uploadAttachment(todoId, file),

    onSuccess: (_row, { todoId }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.attachments(todoId),
      });
    },
  });
}
