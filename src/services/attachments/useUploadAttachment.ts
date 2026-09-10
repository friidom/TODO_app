import { useMutation, useQueryClient } from "@tanstack/react-query";

import { insertAttachment, removeObject, uploadObject } from "./attachmentsApi";
import { FALLBACK_MIME, attachmentPath } from "./fileMeta";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useAuth } from "@/services/auth/useAuth";
import { useBoardId } from "@/hooks/useBoardId";

interface UploadAttachmentVars {
  todoId: string;
  file: File;
}

// Object uploaded before the row insert — an object with no row is a permanent orphan, a row with no object is a visible/deletable one.
// Not optimistic — AttachmentsSection renders in-flight rows from local state so several files can upload and fail independently.
export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const { user } = useAuth();

  return useMutation({
    // Silent — AttachmentsSection renders its own per-file error row with Retry; the global toast would duplicate that.
    meta: { silent: true },

    mutationFn: async ({ todoId, file }: UploadAttachmentVars) => {
      if (!boardId) throw new Error("useUploadAttachment ran without a board");
      if (!user) throw new Error("useUploadAttachment ran without a session");

      const id = crypto.randomUUID();
      const path = attachmentPath(boardId, todoId, id, file.name);
      const mime = file.type || FALLBACK_MIME;

      await uploadObject(path, file, mime);

      try {
        return await insertAttachment({
          id,
          board_id: boardId,
          todo_id: todoId,
          uploader_id: user.id,
          filename: file.name,
          storage_path: path,
          size_bytes: file.size,
          mime_type: mime,
        });
      } catch (error) {
        // Unwind the object — swallowed, since the caller needs the original error, not this cleanup's.
        await removeObject(path).catch(() => {});

        throw error;
      }
    },

    onSuccess: (_row, { todoId }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.attachments(todoId),
      });
    },
  });
}
