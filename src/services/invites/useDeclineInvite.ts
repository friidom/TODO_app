import { useMutation, useQueryClient } from "@tanstack/react-query";

import { declineInvite } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// notifications() is invalidated too — the inbox row re-reads my_pending_invites to decide if it's still actionable.
export function useDeclineInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { silent: true },

    mutationFn: declineInvite,

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myInvites() });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
  });
}
