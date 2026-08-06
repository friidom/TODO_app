import { useQuery } from "@tanstack/react-query";
import { getBoard } from "./boardsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * One board by id.
 *
 * `enabled` guards the undefined case rather than the query function doing it,
 * so a missing id is "not asked yet" instead of a query that resolves to null —
 * the two are different states, and M2-10 renders a 404 for only one of them.
 */
export function useBoard(boardId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: () => getBoard(boardId as string),
    enabled: Boolean(boardId),
  });
}
