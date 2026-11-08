import { useQuery } from "@tanstack/react-query";

import { fetchBoardMembers } from "./membersApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function membersQuery(boardId: string | undefined) {
  return {
    queryKey: queryKeys.members(boardId),
    queryFn: () => fetchBoardMembers(boardId!),
    enabled: Boolean(boardId),
  };
}

export function useBoardMembers(boardId: string | undefined) {
  return useQuery(membersQuery(boardId));
}
