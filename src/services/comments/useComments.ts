import { useQuery } from "@tanstack/react-query";

import { fetchComments } from "./commentsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// fetched only while the task is open, not joined into the board query — closing it lets gcTime drop the entry
export function useComments(todoId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.comments(todoId),
    queryFn: () => {
      if (!todoId) throw new Error("useComments ran without a work item");

      return fetchComments(todoId);
    },
    enabled: Boolean(todoId),
  });
}
