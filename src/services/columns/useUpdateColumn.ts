import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateColumn } from "./columnsApi";
import type { IColumn } from "@/types/data";

export function useUpdateColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateColumn,

    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: ["columns"] });

      const previous = queryClient.getQueryData<IColumn[]>(["columns"]) ?? [];

      queryClient.setQueryData<IColumn[]>(["columns"], (old = []) =>
        old.map((column) =>
          column.id === id ? { ...column, ...patch } : column,
        ),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["columns"], context?.previous);
    },
  });
}
