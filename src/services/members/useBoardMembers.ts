import { useQuery } from "@tanstack/react-query";

import { fetchBoardMembers } from "./membersApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useBoardMembers(boardId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.members(boardId),
    queryFn: () => fetchBoardMembers(boardId!),
    enabled: Boolean(boardId),
  });
}
