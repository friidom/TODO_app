import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateColumn } from "./columnsApi";
import type { IColumn } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

export function useUpdateColumn() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: updateColumn,

    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.columns(boardId) });

      const previous =
        queryClient.getQueryData<IColumn[]>(queryKeys.columns(boardId)) ?? [];

      queryClient.setQueryData<IColumn[]>(
        queryKeys.columns(boardId),
        (old = []) =>
          old.map((column) =>
            column.id === id ? { ...column, ...patch } : column,
          ),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKeys.columns(boardId), context?.previous);
    },
  });
}
