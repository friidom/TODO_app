import { useQuery } from "@tanstack/react-query";

import { fetchDevelopment } from "./gitlabApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useDevelopment(
  boardId: string | undefined,
  todoId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.development(boardId, todoId),
    queryFn: () => fetchDevelopment(todoId!),
    enabled: Boolean(boardId) && Boolean(todoId),
  });
}
