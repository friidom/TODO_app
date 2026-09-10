import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteSpace } from "./spacesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// boards() invalidation isn't optional — space_id gets nulled server-side (on delete set null), so a stale board list would render under a heading that's gone
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
