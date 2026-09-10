import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  moveColumnRank,
  rebalanceBoardColumnRanks,
} from "@/services/columns/columnsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "./useBoardId";
import type { IColumn } from "@/types/data";
import { byRank, neighboursAt, rankBetween } from "@/utils/rank";

// Shared by the header menu's arrows and drag — one implementation so they can't disagree. One row per move, not a full renumber.
export function useColumnReorder(orderedColumns: IColumn[]) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  const mutation = useMutation({
    mutationFn: async ({
      id,
      rank,
    }: {
      id: string;
      rank: number;
      previous: IColumn[] | undefined;
    }) => {
      if (!boardId) throw new Error("useColumnReorder ran without a board");

      await moveColumnRank({ id, boardId, rank });
    },

    // snapshot rides in variables, not onMutate context — moveColumn writes synchronously, onMutate would land a tick late
    onError: (_error, variables) => {
      if (variables.previous) {
        queryClient.setQueryData(
          queryKeys.columns(boardId),
          variables.previous,
        );
      }
    },
  });

  const moveColumn = (from: number, to: number) => {
    const moved = orderedColumns[from];

    if (!moved || from === to) return;

    // rank computed against the list without the moved column — otherwise a one-step move midpoints against the gap it already occupies
    const without = orderedColumns.filter((column) => column.id !== moved.id);
    const { before, after } = neighboursAt(without, to);

    const rank = rankBetween(before, after);

    if (rank === null) {
      if (boardId) {
        rebalanceBoardColumnRanks(boardId)
          .then(() =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.columns(boardId),
            }),
          )
          .catch(() =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.columns(boardId),
            }),
          );
      }

      return;
    }

    const previous = queryClient.getQueryData<IColumn[]>(
      queryKeys.columns(boardId),
    );

    queryClient.setQueryData<IColumn[]>(queryKeys.columns(boardId), (old) =>
      (old ?? [])
        .map((column) =>
          column.id === moved.id ? { ...column, rank } : column,
        )
        .sort(byRank),
    );

    mutation.mutate({ id: moved.id, rank, previous });
  };

  return { moveColumn };
}
