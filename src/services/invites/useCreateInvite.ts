import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createInvite } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

// invalidates rather than patching — the server picks the token and expiry, nothing to guess at
export function useCreateInvite() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    meta: { silent: true },

    mutationFn: createInvite,

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invites(boardId) });

      // autocomplete filters out anyone with a live invite, so every cached search is now off by one person
      queryClient.invalidateQueries({
        queryKey: queryKeys.inviteeSearches(boardId),
      });
    },
  });
}
