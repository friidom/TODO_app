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

      // The board's columns and todos are gone server-side by cascade, and as
      // of M2-11 both keys are board-scoped, so they can finally be evicted
      // here — the note that used to stand in for this said to do it "at which
      // point", and this is that point. Without it a board id that is reused by
      // the router (Back, or a stale link) would render from a cache entry
      // describing a board that no longer exists.
      queryClient.removeQueries({ queryKey: queryKeys.columns(id) });
      queryClient.removeQueries({ queryKey: queryKeys.todos(id) });
    },
  });
}
