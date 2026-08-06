import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderColumns } from "./columnsApi";
import type { IColumn } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

export function useReorderColumns() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: (columns: IColumn[]) => {
      if (!boardId) throw new Error("useReorderColumns ran without a board");
      return reorderColumns(columns, boardId);
    },

    onMutate: async (columns) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.columns(boardId),
      });

      const previous =
        queryClient.getQueryData<IColumn[]>(queryKeys.columns(boardId)) ?? [];

      queryClient.setQueryData(queryKeys.columns(boardId), columns);

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKeys.columns(boardId), context?.previous);
    },
  });
}
