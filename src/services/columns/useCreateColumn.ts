import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createColumn } from "./columnsApi";
import type { IColumn } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useCreateColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createColumn,

    onSuccess: (newColumn) => {
      queryClient.setQueryData<IColumn[]>(queryKeys.columns(), (old = []) => [
        ...old,
        newColumn,
      ]);
    },
  });
}
