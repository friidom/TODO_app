import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateColumn } from "./columnsApi";
import type { IColumn } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useUpdateColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateColumn,

    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.columns() });

      const previous =
        queryClient.getQueryData<IColumn[]>(queryKeys.columns()) ?? [];

      queryClient.setQueryData<IColumn[]>(queryKeys.columns(), (old = []) =>
        old.map((column) =>
          column.id === id ? { ...column, ...patch } : column,
        ),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKeys.columns(), context?.previous);
    },
  });
}
