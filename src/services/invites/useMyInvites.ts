import { useQuery } from "@tanstack/react-query";

import { fetchMyInvites } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useAuth } from "@/services/auth/useAuth";

/**
 * Invitations waiting for the signed-in user (M4-08).
 *
 * Stage 1 sends no email, so this is the only way an addressed invitation
 * reaches the person it was addressed to. Stage 2 adds a message in their inbox
 * and this list stays exactly as it is — the mail becomes a second doorway to
 * the same rows, not a replacement for them.
 *
 * Keyed to the person rather than to a board, and gated on the session because
 * the RPC reads `auth.uid()`: asking before sign-in resolves is a guaranteed
 * empty answer that would then be cached as if it meant something.
 */
export function useMyInvites() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.myInvites(),
    queryFn: fetchMyInvites,
    enabled: Boolean(user),
  });
}
