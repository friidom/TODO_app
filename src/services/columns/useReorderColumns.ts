import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderColumns } from "./columnsApi";
import type { IColumn } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useReorderColumns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reorderColumns,

    onMutate: async (columns) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.columns(),
      });

      const previous =
        queryClient.getQueryData<IColumn[]>(queryKeys.columns()) ?? [];

      queryClient.setQueryData(queryKeys.columns(), columns);

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKeys.columns(), context?.previous);
    },
  });
}
