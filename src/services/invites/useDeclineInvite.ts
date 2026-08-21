import { useMutation, useQueryClient } from "@tanstack/react-query";

import { declineInvite } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * Refuse an invitation (M23).
 *
 * Shaped on `useAcceptInvite` deliberately, so the two halves of the same
 * decision behave the same way: token in, `meta: { silent: true }` because the
 * caller renders its own failure, and the caches that went stale invalidated on
 * success.
 *
 * **Fewer invalidations than accepting, and the difference is the point.**
 * Accepting adds you to a board, so `boards()` and that board's `members` both
 * change. Declining adds you to nothing — the only things that move are the
 * pending list the invitation was in and the inbox row that offered it.
 *
 * **`notifications()` is invalidated here and by `useAcceptInvite`**, because
 * the invitation now lives in the inbox rather than in a sidebar section. The
 * row itself survives — a notification is a record that something happened, and
 * "you were invited" stays true — but the panel re-reads `my_pending_invites`
 * to decide whether it is still actionable, so both caches have to turn over
 * together or the buttons outlive the invitation.
 */
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
