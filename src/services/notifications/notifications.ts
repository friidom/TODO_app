import i18n, { translated } from "@/components/i18n";
import { roleLabel } from "@/components/members/roleStyles";

// Pure inbox logic — which tab a row belongs to, where clicking it goes, how many are unread.
// payload carries titles as they were when the event happened, so a notification still reads right after the board's renamed or the card's gone.

export const NOTIFICATION_TYPES = ["invite", "assigned"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  board_id: string | null;
  entity_type: "todo" | "invite" | null;
  entity_id: string | null;
  actor_id: string | null;
  payload: {
    board_title?: string;
    todo_title?: string;
    actor_name?: string | null;
    role?: string;
  };
  read_at: string | null;
  created_at: string;
}

export const NOTIFICATION_TABS = ["all", "invite", "assigned"] as const;

export type NotificationTab = (typeof NOTIFICATION_TABS)[number];

export const NOTIFICATION_TAB_LABELS = translated<NotificationTab>({
  all: "notifications.tabs.all",
  invite: "notifications.tabs.invite",
  assigned: "notifications.tabs.assigned",
});

export function isNotificationTab(
  value: string | null,
): value is NotificationTab {
  return (NOTIFICATION_TABS as readonly string[]).includes(value ?? "");
}

export function filterNotifications(
  notifications: Notification[],
  tab: NotificationTab,
): Notification[] {
  if (tab === "all") return notifications;

  return notifications.filter((item) => item.type === tab);
}

export function unreadCount(notifications: Notification[]): number {
  return notifications.reduce(
    (total, item) => (item.read_at === null ? total + 1 : total),
    0,
  );
}

export function isUnread(notification: Notification): boolean {
  return notification.read_at === null;
}

// Returns null when there's nothing to open — the row still renders, it just isn't a link.
export function notificationTarget(notification: Notification): string | null {
  if (!notification.board_id) return null;

  if (notification.type === "assigned" && notification.entity_id) {
    return `/boards/${notification.board_id}?task=${notification.entity_id}`;
  }

  if (notification.type === "invite") {
    return `/boards/${notification.board_id}`;
  }

  return null;
}

export function notificationText(notification: Notification): {
  title: string;
  detail: string;
} {
  const actor = notification.payload.actor_name || i18n.t("presence.someone");
  const board =
    notification.payload.board_title || i18n.t("notifications.aBoard");

  if (notification.type === "invite") {
    return {
      title: i18n.t("notifications.invited", { actor, board }),
      detail: notification.payload.role
        ? i18n.t("notifications.asRole", {
            role: roleLabel(notification.payload.role).toLowerCase(),
          })
        : i18n.t("notifications.boardInvitation"),
    };
  }

  return {
    title: i18n.t("notifications.assigned", {
      actor,
      task: notification.payload.todo_title || i18n.t("notifications.aTask"),
    }),
    detail: board,
  };
}

// entity_id holds the invite's id, never its token — a token is a credential and shouldn't sit in a row every client can read.
export function inviteIdOf(notification: Notification): string | null {
  if (notification.type !== "invite") return null;

  return notification.entity_id ?? null;
}
