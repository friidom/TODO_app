import { useQuery } from "@tanstack/react-query";

import { fetchPendingInvites } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

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
    enabled: Boolean(boardId) && canInvite,
  });
}
