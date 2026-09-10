import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/useAuth";
import { queryKeys } from "@/services/queryClient/queryKeys";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationsRead,
} from "./notificationsApi";

// No realtime — a user-scoped channel is a whole second subscription model. refetchOnWindowFocus plus a refetch on open covers it.
export function useNotifications(enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.notificationList(),
    queryFn: fetchNotifications,
    enabled: Boolean(user) && enabled,
    meta: { silent: true },
    retry: false,
  });
}

export function useUnreadCount() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.notificationUnread(),
    queryFn: fetchUnreadCount,
    enabled: Boolean(user),
    retry: false,
    meta: { silent: true },
  });

  return query.data ?? 0;
}

// optimistic, unlike most mutations here — the badge sits in the corner of the eye, and a round-trip delay reads as the click not working
export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[] | "all") =>
      ids === "all" ? markAllNotificationsRead() : markNotificationsRead(ids),

    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications() });

      const previousList = queryClient.getQueryData(
        queryKeys.notificationList(),
      );
      const previousCount = queryClient.getQueryData(
        queryKeys.notificationUnread(),
      );

      const stamp = new Date().toISOString();
      const marks = (id: string) => ids === "all" || ids.includes(id);

      queryClient.setQueryData(
        queryKeys.notificationList(),
        (rows: { id: string; read_at: string | null }[] = []) =>
          rows.map((row) =>
            row.read_at === null && marks(row.id)
              ? { ...row, read_at: stamp }
              : row,
          ),
      );

      queryClient.setQueryData(
        queryKeys.notificationUnread(),
        (count: number = 0) =>
          ids === "all"
            ? 0
            : Math.max(0, count - unreadAmong(ids, previousList)),
      );

      return { previousList, previousCount };
    },

    onError: (_error, _ids, context) => {
      queryClient.setQueryData(
        queryKeys.notificationList(),
        context?.previousList,
      );
      queryClient.setQueryData(
        queryKeys.notificationUnread(),
        context?.previousCount,
      );
    },

    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() }),
  });
}

// counts from the snapshot, not ids.length — a click on an already-read row shouldn't decrement the badge
function unreadAmong(ids: string[], previousList: unknown): number {
  const rows = (previousList ?? []) as { id: string; read_at: string | null }[];

  return rows.filter((row) => row.read_at === null && ids.includes(row.id))
    .length;
}
