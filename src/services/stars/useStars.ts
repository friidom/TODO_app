import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/useAuth";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { applyStarToggled, type Star } from "./starred";
import { fetchStarred, starBoard, unstarBoard } from "./starsApi";

const NO_STARS: Star[] = [];

export function useStarred() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.starred(),
    queryFn: fetchStarred,
    enabled: Boolean(user),
  });
}

export function useIsStarred(boardId: string | undefined): boolean {
  const { data = NO_STARS } = useStarred();

  return (
    boardId !== undefined && data.some((star) => star.board_id === boardId)
  );
}

// One scope per board, so a quick double toggle runs its two writes in order rather than racing.
export function useToggleStar(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    scope: { id: `star:${boardId}` },
    mutationFn: async (on: boolean): Promise<void> => {
      if (on) await starBoard(boardId);
      else await unstarBoard(boardId);
    },

    onMutate: async (on) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.starred() });

      const previous = queryClient.getQueryData<Star[]>(queryKeys.starred());

      queryClient.setQueryData<Star[]>(queryKeys.starred(), (old = NO_STARS) =>
        applyStarToggled(old, boardId, on, new Date().toISOString()),
      );

      return { previous };
    },

    onError: (_err, _on, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.starred(), context.previous);
      }
    },

    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.starred() }),
  });
}
