import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBoard } from "./boardsApi";
import type { IBoard } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useCreateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    // The id is minted here rather than inside createBoard so that onMutate
    // and the request agree on it. Generating it in the API function would put
    // the optimistic row under an id the server never returns.
    mutationFn: ({ id, title }: { id?: string; title: string }) =>
      createBoard({ id, title }),

    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.boards() });

      const previousBoards =
        queryClient.getQueryData<IBoard[]>(queryKeys.boards()) ?? [];

      // Only meaningful when the caller supplied an id. Without one there is
      // nothing to reconcile against, so the list simply refreshes on success.
      if (!id) return { previousBoards, optimisticId: undefined };

      const now = new Date().toISOString();

      const optimisticBoard: IBoard = {
        id,
        title,
        // Unknown until the server answers. owner_id is filled from the
        // session there; the echo replaces this whole row on success.
        owner_id: "",
        description: null,
        icon: null,
        cover_color: null,
        visibility: "private",
        // A board with no cards yet, so its first task key will be KAN-1 —
        // the same value the column defaults to server-side (M2-21).
        next_key: 1,
        created_at: now,
        updated_at: now,
      };

      queryClient.setQueryData<IBoard[]>(queryKeys.boards(), [
        ...previousBoards,
        optimisticBoard,
      ]);

      return { previousBoards, optimisticId: id };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKeys.boards(), context?.previousBoards);
    },

    onSuccess: (serverBoard, _vars, context) => {
      queryClient.setQueryData<IBoard[]>(queryKeys.boards(), (old = []) =>
        // Swap the placeholder for the real row when there was one; otherwise
        // append, since nothing optimistic is holding its place.
        context?.optimisticId
          ? old.map((board) =>
              board.id === context.optimisticId ? serverBoard : board,
            )
          : [...old, serverBoard],
      );

      // Seed the detail cache so navigating straight to the new board does not
      // refetch a row we are already holding.
      queryClient.setQueryData<IBoard>(
        queryKeys.board(serverBoard.id),
        serverBoard,
      );
    },
  });
}
