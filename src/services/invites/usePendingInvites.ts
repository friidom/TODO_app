import { useQuery } from "@tanstack/react-query";

import { fetchPendingInvites, type BoardInvite } from "./invitesApi";
import { isExpired } from "./inviteLink";
import { queryKeys } from "@/services/queryClient/queryKeys";

// Second expiry check for stale cache / a modal left open past the lapse moment — the fetch already excludes expired rows too.
function withoutExpired(invites: BoardInvite[]): BoardInvite[] {
  return invites.filter((invite) => !isExpired(invite.expires_at));
}

// canInvite gates the query too, not just the modal — a viewer's request would just return [] anyway.
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
