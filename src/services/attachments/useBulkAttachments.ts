import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteAttachmentRow, removeObject, signedUrl } from "./attachmentsApi";
import { downloadName } from "./fileMeta";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Attachment } from "@/types/data";

const DOWNLOAD_STAGGER_MS = 350;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// A detached anchor, not window.location — several downloads in a loop would cancel each other via location.href.
function saveViaAnchor(url: string, filename: string) {
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

// Not a zip — a client-side archiver is a dependency that holds every file in memory. Staggered so the browser treats it as a series, not a burst it blocks.
export function useDownloadAllAttachments() {
  return useMutation({
    mutationFn: async (attachments: Attachment[]) => {
      for (const [index, attachment] of attachments.entries()) {
        const url = await signedUrl(
          attachment.storage_path,
          downloadName(attachment.filename),
        );

        saveViaAnchor(url, downloadName(attachment.filename));

        if (index < attachments.length - 1) await wait(DOWNLOAD_STAGGER_MS);
      }

      return attachments.length;
    },
  });
}

// Sequential, not Promise.all — a failure part-way leaves a determinate set removed rather than an indeterminate one.
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
        await removeObject(attachment.storage_path);
        await deleteAttachmentRow(attachment.id);
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
