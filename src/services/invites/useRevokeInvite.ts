import { useMutation, useQueryClient } from "@tanstack/react-query";

import { revokeInvite } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

/**
 * Withdraws a pending invitation.
 *
 * Invalidates rather than removing the row optimistically, and the reason is
 * not latency: a revoke that appears to work but did not is a link the sender
 * believes is dead and is not. The list should only lose the row once the
 * server says it is gone.
 *
 * `meta: { silent: true }` — the row renders its own error inline.
 */
export function useRevokeInvite() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    meta: { silent: true },

    mutationFn: revokeInvite,

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invites(boardId) });
    },
  });
}
