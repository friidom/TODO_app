import { useQuery } from "@tanstack/react-query";
import { getBoard } from "./boardsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// enabled guards the undefined id — "not asked yet" is a different state from "resolved to null"
export function useBoard(boardId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: () => getBoard(boardId as string),
    enabled: Boolean(boardId),
  });
}
