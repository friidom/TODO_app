import { useQuery } from "@tanstack/react-query";

import { fetchAttachments } from "./attachmentsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// Fetched only while the task is open — no realtime on this table, so the client's default staleTime governs refocus.
export function useAttachments(todoId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.attachments(todoId),
    queryFn: () => {
      if (!todoId) throw new Error("useAttachments ran without a work item");

      return fetchAttachments(todoId);
    },
    enabled: Boolean(todoId),
  });
}
