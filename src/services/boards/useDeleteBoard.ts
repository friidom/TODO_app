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
      // Drop the detail entry rather than leaving a cached row for a board
      // that no longer exists.
      queryClient.removeQueries({ queryKey: queryKeys.board(id) });

      // The board's columns and todos are gone server-side by cascade, but
      // this cannot yet evict them: those keys are still global. M2-11 makes
      // them board-scoped, at which point this should also remove
      // queryKeys.columns(id) and queryKeys.todos(id).
    },
  });
}
