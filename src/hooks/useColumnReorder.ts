import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/services/queryClient/queryKeys";
import { withColumnOrder } from "@/services/workflow/draft";
import { usePublishWorkflow } from "@/services/workflow/usePublishWorkflow";
import type { IColumn, IWorkflow } from "@/types/data";
import { RANK_GAP } from "@/utils/rank";
import { useBoardId } from "./useBoardId";

// Shared by the header menu's arrows and drag — one implementation so they
// can't disagree. Column order is the workflow's, so a move is a publish of the
// whole order; the server assigns ranks by position on every publish.
export function useColumnReorder(orderedColumns: IColumn[]) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const publish = usePublishWorkflow();

  const moveColumn = (from: number, to: number) => {
    const moved = orderedColumns[from];

    if (!moved || from === to) return;

    const order = orderedColumns.filter((column) => column.id !== moved.id);

    order.splice(to, 0, moved);

    const ids = order.map((column) => column.id);

    // Painted now rather than when the publish lands, so a dropped column does
    // not snap back for a round trip. A refused publish refetches the snapshot,
    // which is the rollback.
    queryClient.setQueryData<IWorkflow>(queryKeys.workflow(boardId), (old) =>
      old
        ? {
            ...old,
            columns: old.columns.map((column) => {
              const index = ids.indexOf(column.id);

              return index === -1
                ? column
                : { ...column, rank: (index + 1) * RANK_GAP };
            }),
          }
        : old,
    );

    publish.mutate((draft) => withColumnOrder(draft, ids));
  };

  return { moveColumn };
}
