import { useAuth } from "@/services/auth/useAuth";
import { useBoardMembers } from "@/services/members/useBoardMembers";

/**
 * Whether the signed-in user may invite people to this board.
 *
 * **Deliberately narrow, and deliberately not `usePermissions`.** M3-09 is the
 * planned home for general permission gating and has not been built; this
 * answers one question for one feature and should be folded into that hook
 * when it lands, not grown into it here.
 *
 * The role comes from the roster rather than a fresh read of `board_members`:
 * every board page already has `useBoardMembers` in flight — the context rail,
 * the assignee picker and the filters all call it — so TanStack Query dedupes
 * this against those and it costs no extra request.
 *
 * `canInvite` is false while the roster is loading. Showing the control and
 * then withdrawing it is worse than showing it a moment late, and the server
 * refuses the call either way — this is UX, not enforcement (the invite rules
 * live in `create_invite`).
 */
export function useCanInvite(boardId: string | undefined) {
  const { user } = useAuth();
  const { data: members } = useBoardMembers(boardId);

  const role = members?.find((member) => member.id === user?.id)?.role ?? null;

  return {
    role,
    canInvite: role === "owner" || role === "admin",
    /**
     * Only an owner may invite an admin — an admin inviting an admin is
     * refused by `create_invite`'s strictly-below-own-rank rule, the same rule
     * that stops an admin promoting one. The modal disables the option and
     * says why rather than letting the request fail.
     */
    canInviteAdmins: role === "owner",
  };
}
