import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createSpace } from "./spacesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// invalidates rather than patching optimistically — this isn't a hot path like drag, a refetch is simpler and can't disagree with the server
export function useCreateSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSpace,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.spaces() }),
  });
}
