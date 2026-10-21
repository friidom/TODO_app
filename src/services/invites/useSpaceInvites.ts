import { useQuery } from "@tanstack/react-query";

import { fetchSpaceInvites, type SpaceInvite } from "./invitesApi";
import { isExpired } from "./inviteLink";
import { queryKeys } from "@/services/queryClient/queryKeys";

const withoutExpired = (invites: SpaceInvite[]) =>
  invites.filter((invite) => !isExpired(invite.expires_at));

// Owner-only on the server; `enabled` keeps anyone else from asking.
export function useSpaceInvites(spaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.spaceInvites(spaceId),
    queryFn: () => fetchSpaceInvites(spaceId!),
    select: withoutExpired,
    enabled: Boolean(spaceId) && enabled,
  });
}
