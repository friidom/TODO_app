import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateSpace } from "./spacesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/** Rename a space. Invalidates for the reason `useCreateSpace` records. */
export function useUpdateSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSpace,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.spaces() }),
  });
}
