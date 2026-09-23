import { useMutation } from "@tanstack/react-query";

import { downloadAttachment } from "./attachmentsApi";

// A mutation, not a query: it saves a file rather than producing state, and
// nothing about it should be cached. Not silent — there is no row of its own
// to report a failure in, so it falls through to the global toast.
export function useDownloadAttachment() {
  return useMutation({
    mutationFn: ({
      todoId,
      id,
      filename,
    }: {
      todoId: string;
      id: string;
      filename: string;
    }) => downloadAttachment(todoId, id, filename),
  });
}
