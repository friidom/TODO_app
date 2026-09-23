import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteAttachment, downloadAttachment } from "./attachmentsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Attachment } from "@/types/data";

const DOWNLOAD_STAGGER_MS = 350;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Not a zip — a client-side archiver is a dependency that holds every file in
// memory. Staggered so the browser treats it as a series, not a burst it blocks.
export function useDownloadAllAttachments() {
  return useMutation({
    mutationFn: async (attachments: Attachment[]) => {
      for (const [index, attachment] of attachments.entries()) {
        await downloadAttachment(
          attachment.todo_id,
          attachment.id,
          attachment.filename,
        );

        if (index < attachments.length - 1) await wait(DOWNLOAD_STAGGER_MS);
      }

      return attachments.length;
    },
  });
}

// Sequential, not Promise.all — a failure part-way leaves a determinate set
// removed rather than an indeterminate one.
export function useDeleteAllAttachments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      attachments,
    }: {
      attachments: Attachment[];
      todoId: string;
    }) => {
      for (const attachment of attachments) {
        await deleteAttachment(attachment.todo_id, attachment.id);
      }

      return attachments.length;
    },

    // onSettled, not onSuccess — a run that stopped half-way still changed the list.
    onSettled: (_count, _error, { todoId }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.attachments(todoId),
      });
    },
  });
}
