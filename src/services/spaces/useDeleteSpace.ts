import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteSpace } from "./spacesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * Delete a space. The boards inside it survive as unfiled.
 *
 * **Both caches are invalidated, and the boards one is not optional.** The
 * server sets every `boards.space_id` in this space to null by the
 * `on delete set null` foreign key, so a cached board list still claiming the
 * old filing would render boards under a heading that no longer exists.
 */
export function useDeleteSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSpace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.spaces() });
      queryClient.invalidateQueries({ queryKey: queryKeys.boards() });
    },
  });
}
