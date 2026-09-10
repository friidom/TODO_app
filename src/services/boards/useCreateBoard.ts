import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBoard } from "./boardsApi";
import type { IBoard } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { DEFAULT_KEY_PREFIX } from "@/utils/taskKey";

export function useCreateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    // id minted by the caller, not inside createBoard, so onMutate and the request agree on it
    mutationFn: ({
      id,
      title,
      spaceId,
    }: {
      id?: string;
      title: string;
      spaceId?: string | null;
    }) => createBoard({ id, title, spaceId }),

    onMutate: async ({ id, title, spaceId = null }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.boards() });

      const previousBoards =
        queryClient.getQueryData<IBoard[]>(queryKeys.boards()) ?? [];

      if (!id) return { previousBoards, optimisticId: undefined };

      const now = new Date().toISOString();

      const optimisticBoard: IBoard = {
        id,
        title,
        owner_id: "",
        description: null,
        icon: null,
        cover_color: null,
        visibility: "private",
        next_key: 1,
        key_prefix: DEFAULT_KEY_PREFIX,
        space_id: spaceId,
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
        context?.optimisticId
          ? old.map((board) =>
              board.id === context.optimisticId ? serverBoard : board,
            )
          : [...old, serverBoard],
      );

      queryClient.setQueryData<IBoard>(
        queryKeys.board(serverBoard.id),
        serverBoard,
      );
    },
  });
}
