import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateColumn } from "./columnsApi";
import { applyColumnUpdated } from "./cache";
import type { IWorkflow } from "@/types/data";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

// Limits only — the one column field that is not the workflow's.
export function useUpdateColumn() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: updateColumn,

    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.workflow(boardId),
      });

      const previous = queryClient.getQueryData<IWorkflow>(
        queryKeys.workflow(boardId),
      );

      queryClient.setQueryData<IWorkflow>(queryKeys.workflow(boardId), (old) =>
        old
          ? {
              ...old,
              columns: applyColumnUpdated(old.columns, { id, ...patch }),
            }
          : old,
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKeys.workflow(boardId), context?.previous);
    },
  });
}
