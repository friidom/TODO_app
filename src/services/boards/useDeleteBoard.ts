import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteBoard } from "./boardsApi";
import type { IBoard } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBoard(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.boards() });

      const previousBoards =
        queryClient.getQueryData<IBoard[]>(queryKeys.boards()) ?? [];

      queryClient.setQueryData<IBoard[]>(queryKeys.boards(), (old = []) =>
        old.filter((board) => board.id !== id),
      );

      return { previousBoards, id };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKeys.boards(), context?.previousBoards);
    },

    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.board(id) });

      // columns/todos are gone server-side by cascade — evict so Back or a stale link doesn't render a dead board from cache
      queryClient.removeQueries({ queryKey: queryKeys.columns(id) });
      queryClient.removeQueries({ queryKey: queryKeys.todos(id) });
    },
  });
}
