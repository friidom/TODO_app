import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createSpace } from "./spacesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * **Invalidates rather than patching optimistically**, and the three space
 * mutations all do.
 *
 * The board and todo mutations patch the cache by hand because they are on a
 * hot path — a drag has to look instant and cannot afford a round trip.
 * Creating a folder happens from a modal that is already showing a pending
 * state, a few times in an account's life. Hand-written optimistic patches are
 * a rollback path and a reconciliation rule to maintain forever; a refetch is
 * one line and cannot disagree with the server.
 */
export function useCreateSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSpace,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.spaces() }),
  });
}
