import { useMutation } from "@tanstack/react-query";

import { signedUrl } from "./attachmentsApi";
import { downloadName } from "./fileMeta";

// A mutation, not a query — the URL expires in a minute and must never be cached or reused. Not silent: no row of its own to report a failure in.
export function useAttachmentUrl() {
  return useMutation({
    mutationFn: ({
      storagePath,
      filename,
    }: {
      storagePath: string;
      filename: string;
    }) => signedUrl(storagePath, downloadName(filename)),
  });
}
