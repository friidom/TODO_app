import { useMutation, useQueryClient } from "@tanstack/react-query";

import { revokeInvite } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// not optimistic — a revoke that looks like it worked but didn't leaves a link the sender thinks is dead
export function useRevokeInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { silent: true },

    mutationFn: revokeInvite,

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allInvites() });
      queryClient.invalidateQueries({ queryKey: queryKeys.allSpaceInvites() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inviteeSearches() });
    },
  });
}
