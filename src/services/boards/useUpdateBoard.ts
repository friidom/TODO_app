import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBoard } from "./boardsApi";
import type { IBoard } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useUpdateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateBoard,

    // two caches hold this row — the list and the board's own entry — both get patched and both get rolled back
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.boards() });
      await queryClient.cancelQueries({ queryKey: queryKeys.board(id) });

      const previousBoards =
        queryClient.getQueryData<IBoard[]>(queryKeys.boards()) ?? [];
      const previousBoard = queryClient.getQueryData<IBoard>(
        queryKeys.board(id),
      );

      queryClient.setQueryData<IBoard[]>(queryKeys.boards(), (old = []) =>
        old.map((board) => (board.id === id ? { ...board, ...patch } : board)),
      );

      if (previousBoard) {
        queryClient.setQueryData<IBoard>(queryKeys.board(id), {
          ...previousBoard,
          ...patch,
        });
      }

      return { previousBoards, previousBoard, id };
    },

    onError: (_err, _vars, context) => {
      if (!context) return;

      queryClient.setQueryData(queryKeys.boards(), context.previousBoards);

      if (context.previousBoard) {
        queryClient.setQueryData(
          queryKeys.board(context.id),
          context.previousBoard,
        );
      }
    },

    onSuccess: (serverBoard) => {
      queryClient.setQueryData<IBoard[]>(queryKeys.boards(), (old = []) =>
        old.map((board) => (board.id === serverBoard.id ? serverBoard : board)),
      );

      queryClient.setQueryData<IBoard>(
        queryKeys.board(serverBoard.id),
        serverBoard,
      );
    },
  });
}
