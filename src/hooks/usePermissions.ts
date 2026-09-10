import { useMemo } from "react";

import { useAuth } from "@/services/auth/useAuth";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import {
  NO_PERMISSIONS,
  permissionsFor,
  type Permissions,
} from "@/services/members/permissions";
import { useBoardId } from "./useBoardId";

// role comes from the roster query already in flight, not a second self-read — avoids two answers to "what's my role"
// everything is false while it loads, deliberately, so a control never renders and then gets yanked away
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

    // no board in the URL (profile page, etc) — useBoardMembers never resolves there, so isPending would stay true forever
    if (!id) return { ...NO_PERMISSIONS, isLoading: false };

    return { ...permissionsFor(role), isLoading: isPending };
  }, [members, user?.id, isPending, id]);
}
