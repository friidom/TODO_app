import { useMutation, useQueryClient } from "@tanstack/react-query";

import { acceptInvite } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * Redeems an invite token.
 *
 * Not board-scoped on the way in — which board this is for is the RPC's
 * answer, not the caller's, so the invalidations happen in `onSuccess` once
 * `board_id` is known. `useBoardId()` would be undefined here anyway: the
 * accept route is `/invite/:token`, not `/boards/:boardId`.
 *
 * Two caches go stale on success. `boards()` because the user can now reach a
 * board they could not before, and the sidebar reads that list; `members` for
 * the board they just joined, because they are on the roster now and anyone
 * with the board open should see them.
 *
 * `meta: { silent: true }` — the page maps the failure through
 * `inviteErrorMessage` and renders it. The global toast would show the raw
 * database message beside it, which is exactly what that mapper exists to
 * prevent.
 */
export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { silent: true },

    mutationFn: acceptInvite,

    onSuccess: ({ board_id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boards() });
      queryClient.invalidateQueries({ queryKey: queryKeys.members(board_id) });
      // The invitation just stopped being pending (M4-08), so the sidebar list
      // that offered it has to lose the row it was rendering.
      queryClient.invalidateQueries({ queryKey: queryKeys.myInvites() });
    },
  });
}
