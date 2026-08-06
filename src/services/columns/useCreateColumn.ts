import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createColumn } from "./columnsApi";
import { applyColumnInserted } from "./cache";
import type { IColumn } from "@/types/data";
import type { ColumnCategory } from "@/constants/columns";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

export function useCreateColumn() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    // board_id is supplied here rather than by the caller, so no component
    // has to know which board it is on to create a column.
    mutationFn: (vars: { title: string; category: ColumnCategory }) => {
      if (!boardId) throw new Error("useCreateColumn ran without a board");
      return createColumn({ ...vars, board_id: boardId });
    },

    onSuccess: (newColumn) => {
      queryClient.setQueryData<IColumn[]>(
        queryKeys.columns(boardId),
        (old = []) => applyColumnInserted(old, newColumn),
      );
    },
  });
}
