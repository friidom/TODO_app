import { useQuery } from "@tanstack/react-query";

import { signedPreviewUrls } from "./attachmentsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// Refetch well before the hour-long URLs expire.
const PREVIEW_STALE_MS = 30 * 60_000;

// A query, not a mutation like useAttachmentUrl — these are cached and reused by <img>s, not one-shot consumed.
// Callers must pass only paths whose previewKind isn't "none" — see fileMeta.ts.
export function useAttachmentPreviews(paths: string[]) {
  return useQuery({
    queryKey: queryKeys.attachmentPreviews(paths),
    queryFn: () => signedPreviewUrls(paths),
    enabled: paths.length > 0,
    staleTime: PREVIEW_STALE_MS,
    gcTime: PREVIEW_STALE_MS + 5 * 60_000,
    // Cosmetic failure — falls back to the file-type icon, download still works.
    meta: { silent: true },
  });
}
