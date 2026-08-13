import { useQuery } from "@tanstack/react-query";

import { fetchPendingInvites, type BoardInvite } from "./invitesApi";
import { isExpired } from "./inviteLink";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * The second expiry pass (M4-07).
 *
 * `fetchPendingInvites` already excludes expired rows in the request, so this
 * is not that filter repeated — it catches what the request cannot: a cached
 * response, or a modal left open past the moment an invite lapsed. Either
 * would otherwise offer Copy and Revoke on a link that no longer works.
 *
 * Declared at module scope so its identity is stable and TanStack memoizes it
 * against the cached data rather than recomputing on every render.
 *
 * There is no sweeper and no `pg_cron`, deliberately: an expired row nobody
 * can use and nobody can see is not a problem worth a scheduler. `accept_invite`
 * is what actually enforces expiry, against the server's clock.
 */
function withoutExpired(invites: BoardInvite[]): BoardInvite[] {
  return invites.filter((invite) => !isExpired(invite.expires_at));
}

/**
 * One board's pending invitations.
 *
 * `enabled` takes the permission into account as well as the board id. A
 * viewer running this would not fail — M4-01's policy returns an empty set
 * rather than an error — but an empty list is indistinguishable from "no
 * invites", and issuing a request whose answer is structurally always `[]` is
 * a round trip for nothing. The modal is gated on the same flag, so in
 * practice the query only mounts where it can return something.
 */
export function usePendingInvites(
  boardId: string | undefined,
  canInvite: boolean,
) {
  return useQuery({
    queryKey: queryKeys.invites(boardId),
    queryFn: () => fetchPendingInvites(boardId!),
    select: withoutExpired,
    enabled: Boolean(boardId) && canInvite,
  });
}
