import { useQuery } from "@tanstack/react-query";
import { getBoards } from "./boardsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useBoards() {
  return useQuery({
    queryKey: queryKeys.boards(),
    queryFn: getBoards,
  });
}
