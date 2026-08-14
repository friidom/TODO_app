import { useMemo } from "react";

import { useAuth } from "@/services/auth/useAuth";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import {
  NO_PERMISSIONS,
  permissionsFor,
  type Permissions,
} from "@/services/members/permissions";
import { useBoardId } from "./useBoardId";

/**
 * What the signed-in user may do on the board currently open.
 *
 * The one place a component asks. `permissions.ts` holds the rules; this holds
 * the wiring, so a component never compares a role string itself.
 *
 * **The role comes from the roster, not a second query.** The plan suggested
 * reading the caller's own `board_members` row so this would not depend on
 * M3-13 — that was written when the roster RPC did not exist yet. It does now,
 * and every board page already has `useBoardMembers` in flight (the context
 * rail, the assignee picker, the filters), so deriving from it costs no request
 * at all. A separate self-read would be a second answer to "what is my role"
 * that could disagree with the list rendered beside it.
 *
 * **Everything is false while the roster loads**, deliberately. Rendering a
 * control and withdrawing it a moment later is worse than the reverse, and the
 * database refuses the action either way — `isLoading` is exposed for callers
 * that would rather show a skeleton than an absence.
 *
 * Takes an optional board id for the few callers outside the board route; it
 * defaults to the open board.
 */
export function usePermissions(boardId?: string): Permissions & {
  isLoading: boolean;
} {
  const routeBoardId = useBoardId();
  const id = boardId ?? routeBoardId;

  const { user } = useAuth();
  const { data: members, isPending } = useBoardMembers(id);

  return useMemo(() => {
    const role =
      members?.find((member) => member.id === user?.id)?.role ?? null;

    // No board in the URL means no board to hold a role on — the profile page,
    // for one. `useBoardMembers` is disabled there and never resolves, so
    // `isPending` stays true forever; reporting that as loading would leave a
    // caller waiting on an answer that is already known.
    if (!id) return { ...NO_PERMISSIONS, isLoading: false };

    return { ...permissionsFor(role), isLoading: isPending };
  }, [members, user?.id, isPending, id]);
}
