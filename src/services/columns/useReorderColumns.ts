import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderColumns } from "./columnsApi";
import type { IColumn } from "@/types/data";

export function useReorderColumns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reorderColumns,

    onMutate: async (columns) => {
      await queryClient.cancelQueries({
        queryKey: ["columns"],
      });

      const previous =
        queryClient.getQueryData<IColumn[]>(["columns"]) ?? [];

      queryClient.setQueryData(["columns"], columns);

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["columns"], context?.previous);
    },
  });
}