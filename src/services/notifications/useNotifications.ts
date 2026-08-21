import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/useAuth";
import { queryKeys } from "@/services/queryClient/queryKeys";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationsRead,
} from "./notificationsApi";

/**
 * The inbox's data (M22).
 *
 * **No realtime, and that is a decision rather than an omission.** The existing
 * realtime layer is board-channel scoped — `useBoardRealtime` subscribes to one
 * board's rows while you are looking at it. A notification is per *person* and
 * arrives whichever board you happen to have open, so it would need a
 * user-scoped channel: a second subscription model, a second reconnect story
 * and a second set of handlers, which is exactly the "do not rewrite the
 * realtime system" line. TanStack's default `refetchOnWindowFocus` covers the
 * real case — you come back to the tab and the badge is current — and the list
 * refetches when the drawer opens.
 *
 * **The badge is counted server-side, not derived from the list.** Counting the
 * fetched page would cap the badge at `NOTIFICATION_PAGE` and quietly under-
 * report for anyone who has been away. Two queries under one key root, so
 * marking read invalidates both and they cannot disagree.
 */

/** The caller's notifications, newest first. */
export function useNotifications(enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.notificationList(),
    queryFn: fetchNotifications,
    enabled: Boolean(user) && enabled,
    // The panel renders its own failure, so the global QueryCache toast would
    // say the same thing again in the corner — and it toasts failed *refetches*,
    // which on window focus would mean one toast every time the tab is
    // re-entered.
    meta: { silent: true },
    // An inbox read fails the same way three times over — an RLS denial, a
    // dropped connection — so retrying only delays the message the panel is
    // trying to render.
    retry: false,
  });
}

/**
 * How many are unread.
 *
 * Runs for every signed-in user on every page, because the bell is in the
 * sidebar and the sidebar is everywhere. It is one indexed `COUNT(*)` with no
 * body, which is why that is affordable.
 */
export function useUnreadCount() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.notificationUnread(),
    queryFn: fetchUnreadCount,
    enabled: Boolean(user),
    retry: false,
    // Same reasoning, and more so: this one runs on every page for every
    // signed-in user, so a toast here would follow them around the product.
    meta: { silent: true },
  });

  // A failed count is not worth a red badge or an error anywhere — the bell
  // simply shows nothing, and opening it surfaces the real reason.
  return query.data ?? 0;
}

/**
 * Mark rows read.
 *
 * Optimistic, unlike most mutations here, and for a reason specific to this
 * one: the badge is the thing being changed and it sits in the corner of the
 * eye. Waiting a round trip to clear it reads as the click not having worked,
 * which is how people end up clicking twice. The list and the count are patched
 * together, and both roll back together.
 */
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

    // Whatever happened, re-read the truth. The optimistic patch is for the
    // frame, not for the state.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications() }),
  });
}

/**
 * How many of `ids` were actually unread before this.
 *
 * Decrementing by `ids.length` would be wrong the moment somebody clicks a row
 * that is already read — the badge would go negative-ish and then snap back on
 * the refetch. Counted from the snapshot rather than the live cache, because
 * the list has already been patched by the time this runs.
 */
function unreadAmong(ids: string[], previousList: unknown): number {
  const rows = (previousList ?? []) as { id: string; read_at: string | null }[];

  return rows.filter((row) => row.read_at === null && ids.includes(row.id))
    .length;
}
