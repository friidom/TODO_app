import { useEffect, useState } from "react";

import { attachmentObjectUrl } from "./attachmentsApi";

// One URL per component, revoked by the component that made it — a shared
// cache would hand a second reader a URL the first had already revoked.
// Callers pass enabled=false for anything previewKind calls "none".
export function useAttachmentObjectUrl(
  todoId: string,
  attachmentId: string,
  enabled: boolean,
) {
  // The key the result belongs to travels with it, so a resolution that lands
  // after the inputs changed is ignored rather than rendered against the wrong
  // file. Set only from the async callback: assigning in the effect body or its
  // cleanup would be a cascading render.
  const key = enabled ? `${todoId}/${attachmentId}` : "";
  const [loaded, setLoaded] = useState<{ key: string; url?: string }>();

  useEffect(() => {
    if (key === "") return;

    let disposed = false;
    let created: string | undefined;

    attachmentObjectUrl(todoId, attachmentId)
      .then((url) => {
        if (disposed) {
          URL.revokeObjectURL(url);

          return;
        }

        created = url;
        setLoaded({ key, url });
      })
      // Cosmetic: the row falls back to its file-type icon, download still works.
      .catch(() => {
        if (!disposed) setLoaded({ key });
      });

    return () => {
      disposed = true;

      if (created) URL.revokeObjectURL(created);
    };
  }, [key, todoId, attachmentId]);

  const settled = loaded?.key === key;

  return {
    url: settled ? loaded.url : undefined,
    pending: key !== "" && !settled,
  };
}
