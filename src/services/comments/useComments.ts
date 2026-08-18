import { useQuery } from "@tanstack/react-query";

import { fetchComments } from "./commentsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * One work item's thread, fetched only while that task is open (M7-02).
 *
 * `enabled` is the point, as it is for `useTodo` and `useActivities`. The
 * plan's one stated risk for this milestone is comment volume on the board
 * query — *"do not join comments into the board fetch; load them per open work
 * item"* — and this hook is that instruction: nothing is fetched until a task
 * is open, and closing it lets `gcTime` drop the entry.
 *
 * No `staleTime` override. `useActivities` shortens the default because a feed
 * that is stale is a feed that is wrong; a thread is patched by its own
 * mutations and, from M7-04, by a channel, so the client's 30s default is what
 * should govern a refocus.
 */
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
