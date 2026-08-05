import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteColumn } from "./columnsApi";
import type { IColumn } from "@/types/data";
import { byPosition } from "@/utils/position";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useDeleteColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteColumn,

    onSuccess: ({ id }) => {
      // Drop the column and close the gap its position left behind.
      queryClient.setQueryData<IColumn[]>(queryKeys.columns(), (old = []) =>
        old
          .filter((column) => column.id !== id)
          .sort(byPosition)
          .map((column, position) => ({ ...column, position })),
      );

      // The todos moved server-side, so refetch rather than guess their order.
      queryClient.invalidateQueries({ queryKey: queryKeys.todos() });
    },
  });
}
