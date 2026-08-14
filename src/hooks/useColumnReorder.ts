import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  moveColumnRank,
  rebalanceBoardColumnRanks,
} from "@/services/columns/columnsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "./useBoardId";
import type { IColumn } from "@/types/data";
import { byRank, neighboursAt, rankBetween } from "@/utils/rank";

/**
 * Moving a column, for both paths that can do it: the header menu's arrows and
 * the drag. One implementation, so a drag and a menu click cannot disagree —
 * `useBoardDragEnd` takes `moveColumn` as a parameter and calls this one.
 *
 * **One row per move as of M6-04**, matching `useTodoDrop`. It used to renumber
 * every column on the board and upsert all of them, which is the shape that
 * loses a colleague's reorder rather than conflicting with it.
 *
 * `orderedColumns` must be in display order: `from` and `to` are indices into
 * it, and the caller already sorts for rendering.
 */
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
      /** The list to put back if the write is refused. */
      previous: IColumn[] | undefined;
    }) => {
      if (!boardId) throw new Error("useColumnReorder ran without a board");

      await moveColumnRank({ id, boardId, rank });
    },

    // The snapshot rides along in the variables rather than in an `onMutate`
    // context, because the optimistic write happens synchronously in
    // `moveColumn` below — `onMutate` awaits `cancelQueries`, so it lands a
    // tick later and the column would render in its old slot for a frame.
    onError: (_error, variables) => {
      if (variables.previous) {
        queryClient.setQueryData(
          queryKeys.columns(boardId),
          variables.previous,
        );
      }
    },
  });

  /**
   * Move the column at `from` to `to`, both indices into `orderedColumns`.
   *
   * The rank is the midpoint of the gap the column lands in, computed against
   * the list **without** the column being moved — a column cannot be its own
   * neighbour, and leaving it in would make a one-step move compute the
   * midpoint of the gap it already occupies.
   */
  const moveColumn = (from: number, to: number) => {
    const moved = orderedColumns[from];

    if (!moved || from === to) return;

    const without = orderedColumns.filter((column) => column.id !== moved.id);
    const { before, after } = neighboursAt(without, to);

    const rank = rankBetween(before, after);

    if (rank === null) {
      // Exhausted, which for a handful of columns means someone has been
      // dragging into one gap for a very long time. Respace and let them try
      // again — the alternative is two columns sharing a rank.
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

    // Written synchronously with the click or the drop, which is what keeps the
    // column from rendering in its old slot for a frame first. The list is
    // re-sorted rather than spliced, because `rank` is what decides order now.
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
