import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearCompleted } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

export function useClearCompleted() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: () => {
      if (!boardId) throw new Error("useClearCompleted ran without a board");
      return clearCompleted(boardId);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) });
    },
  });
}
