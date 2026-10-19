import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/useAuth";
import { queryKeys } from "@/services/queryClient/queryKeys";
import {
  adminActivityEffects,
  type AdminFeedScope,
} from "@/services/realtime/adminActivity";
import { connectBoardSocket } from "@/services/realtime/socket";

export interface AdminFeedTarget {
  scope: AdminFeedScope;
  openTaskId?: string;
}

const EVERYTHING: AdminFeedTarget = { scope: {} };

export const AdminFeedContext = createContext<{
  setTarget: (next: AdminFeedTarget) => void;
  live: boolean;
} | null>(null);

// One socket for the whole admin area, opened by AdminLayout, so moving between
// admin pages does not reconnect. Pages narrow what a beat refetches through
// useAdminFeedScope rather than each opening a socket of its own.
export function useAdminActivityRealtime() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const target = useRef<AdminFeedTarget>(EVERYTHING);
  const [live, setLive] = useState(false);

  const superadmin = user?.org_role === "superadmin";
  const userId = user?.id;

  useEffect(() => {
    if (!superadmin || !userId) return;

    const socket = connectBoardSocket();

    let hasJoined = false;

    const join = () =>
      socket.emit("admin:join", (result) => {
        setLive(Boolean(result?.ok));

        if (!result?.ok) return;

        // Re-joined after a drop: the beats that arrived in between were never
        // delivered, so refetch rather than trying to reconstruct them.
        if (hasJoined) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.adminActivityAll(),
          });
        }

        hasJoined = true;
      });

    const drop = () => setLive(false);

    socket.on("connect", join);
    socket.on("disconnect", drop);
    socket.on("admin:activity", (event) => {
      const { scope, openTaskId } = target.current;
      const effects = adminActivityEffects(event, scope, openTaskId);

      if (effects.task !== null) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.adminTodo(effects.task),
        });
      }

      if (effects.activity) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.adminActivityAll(),
        });
      }
    });

    return () => {
      socket.off("connect", join);
      socket.removeAllListeners();
      socket.disconnect();
      setLive(false);
    };
  }, [queryClient, superadmin, userId]);

  const setTarget = useCallback((next: AdminFeedTarget) => {
    target.current = next;
  }, []);

  return { setTarget, live };
}

export function useAdminFeedScope(
  scope: AdminFeedScope,
  openTaskId?: string,
): void {
  const feed = useContext(AdminFeedContext);

  // Every render, so a filter change re-scopes the shared listener in place.
  useEffect(() => {
    feed?.setTarget({ scope, openTaskId });
  });

  useEffect(() => () => feed?.setTarget(EVERYTHING), [feed]);
}

export function useAdminLive(): boolean {
  return useContext(AdminFeedContext)?.live ?? false;
}
