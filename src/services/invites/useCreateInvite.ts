import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createInvite } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

/**
 * Mints an invite link.
 *
 * Invalidates rather than patching the cache, unlike the board's todo
 * mutations. Those are optimistic because a card must appear under the
 * pointer the instant it is dropped; an invite has no such deadline, the
 * server decides the token and the expiry, and the list is a handful of rows.
 * Guessing at values only Postgres knows, to save one round trip nobody is
 * watching, would be the wrong trade.
 *
 * `meta: { silent: true }` — the modal renders the failure next to the button
 * that caused it, so the global MutationCache toast would say it twice.
 */
export function useCreateInvite() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    meta: { silent: true },

    mutationFn: createInvite,

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invites(boardId) });

      // The autocomplete filters out anyone already holding a live invitation,
      // so every cached search for this board is now wrong by one person
      // (M4-08). The prefix matches them all.
      queryClient.invalidateQueries({
        queryKey: queryKeys.inviteeSearches(boardId),
      });
    },
  });
}
