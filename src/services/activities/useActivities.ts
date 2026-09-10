import { useQuery } from "@tanstack/react-query";

import { fetchActivities } from "./activitiesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// No mutation invalidates this — the log is trigger-written, so the client never learns a row appeared. Refetches when the drawer opens instead.
export function useActivities(boardId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.activities(boardId),
    queryFn: () => {
      if (!boardId) throw new Error("useActivities ran without a board");

      return fetchActivities(boardId);
    },
    enabled: Boolean(boardId) && enabled,
    staleTime: 10_000,
  });
}
