import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/useAuth";
import { queryKeys } from "@/services/queryClient/queryKeys";
import {
  adminActivityEffects,
  type AdminFeedScope,
} from "@/services/realtime/adminActivity";
import { connectBoardSocket } from "@/services/realtime/socket";

export function useAdminActivityRealtime(
  scope: AdminFeedScope,
  openTaskId?: string,
): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const latest = useRef<{ scope: AdminFeedScope; openTaskId?: string }>({
    scope,
    openTaskId,
  });

  // Written in an effect, not during render: a filter change re-scopes the
  // existing listener rather than tearing the socket down and opening another.
  useEffect(() => {
    latest.current = { scope, openTaskId };
  });

  const superadmin = user?.org_role === "superadmin";
  const userId = user?.id;

  useEffect(() => {
    if (!superadmin || !userId) return;

    const socket = connectBoardSocket();

    const join = () => socket.emit("admin:join", () => undefined);

    socket.on("connect", join);
    socket.on("admin:activity", (event) => {
      const { scope: current, openTaskId: task } = latest.current;
      const effects = adminActivityEffects(event, current, task);

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
    };
  }, [queryClient, superadmin, userId]);
}
