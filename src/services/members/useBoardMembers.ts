import { useQuery } from "@tanstack/react-query";

import { fetchBoardMembers } from "./membersApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * One board's roster.
 *
 * The key comes from the factory rather than being spelled out here — the same
 * rule every other board-scoped hook follows, so the shape of a members key can
 * change in one file instead of in a grep.
 */
export function useBoardMembers(boardId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.members(boardId),
    queryFn: () => fetchBoardMembers(boardId!),
    enabled: Boolean(boardId),
  });
}
