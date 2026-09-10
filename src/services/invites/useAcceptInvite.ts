import { useMutation, useQueryClient } from "@tanstack/react-query";

import { acceptInvite } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// silent — the page maps the failure through inviteErrorMessage itself, no need for the raw db message in a toast too
export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { silent: true },

    mutationFn: acceptInvite,

    onSuccess: ({ board_id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boards() });
      queryClient.invalidateQueries({ queryKey: queryKeys.members(board_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myInvites() });
      // both need to turn over together or the Accept button outlives the now-actioned invite
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
  });
}
