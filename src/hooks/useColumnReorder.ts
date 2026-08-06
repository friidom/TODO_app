import { useQueryClient } from "@tanstack/react-query";

import { applyColumnMoved } from "@/services/columns/cache";
import { useReorderColumns } from "@/services/columns/useReorderColumns";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "./useBoardId";
import type { IColumn } from "@/types/data";

/**
 * Moving a column, for both paths that can do it: the header menu's arrows and
 * the drag. One implementation, so a drag and a menu click cannot disagree —
 * `useBoardDragEnd` takes `moveColumn` as a parameter and calls this one.
 *
 * `orderedColumns` must be sorted by position: `from` and `to` are indices
 * into it, and the caller already sorts for rendering.
 */
export function useColumnReorder(orderedColumns: IColumn[]) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const reorderColumns = useReorderColumns();

  /** Swap a column with its neighbour and renumber the whole list. */
  const moveColumn = (from: number, to: number) => {
    const reordered = applyColumnMoved(orderedColumns, from, to);

    // Written here as well as in the mutation's own `onMutate`, and the two
    // are not redundant: `onMutate` is async and awaits `cancelQueries`, so
    // its write lands a tick later. This one is synchronous with the click or
    // the drop, which is what keeps the column from rendering in its old slot
    // for a frame first.
    queryClient.setQueryData(queryKeys.columns(boardId), reordered);
    reorderColumns.mutate(reordered);
  };

  return { moveColumn };
}
