/**
 * The inbox, as data (M22).
 *
 * Pure — no React, no network — so the parts worth getting right are testable:
 * which tab a row belongs to, where clicking it goes, and how many are unread.
 *
 * **The row shape mirrors the table rather than the UI.** `payload` carries the
 * titles as they were when the event happened, denormalised by the trigger, so
 * a notification stays legible after the board is renamed or the card deleted —
 * see the migration header on why that is deliberate rather than lazy.
 */

/** The types the CHECK constraint permits. Widening means a migration. */
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

/** The filter tabs, in the order they render. */
export const NOTIFICATION_TABS = ["all", "invite", "assigned"] as const;

export type NotificationTab = (typeof NOTIFICATION_TABS)[number];

export const NOTIFICATION_TAB_LABELS: Record<NotificationTab, string> = {
  all: "All",
  invite: "Invitations",
  assigned: "Assignments",
};

export function isNotificationTab(
  value: string | null,
): value is NotificationTab {
  return (NOTIFICATION_TABS as readonly string[]).includes(value ?? "");
}

/** Rows for one tab. `all` is everything, in the order it arrived. */
export function filterNotifications(
  notifications: Notification[],
  tab: NotificationTab,
): Notification[] {
  if (tab === "all") return notifications;

  return notifications.filter((item) => item.type === tab);
}

/** How many are unread — the badge. */
export function unreadCount(notifications: Notification[]): number {
  return notifications.reduce(
    (total, item) => (item.read_at === null ? total + 1 : total),
    0,
  );
}

export function isUnread(notification: Notification): boolean {
  return notification.read_at === null;
}

/**
 * Where clicking one goes.
 *
 * **An assignment opens the task in the board it lives on**, through the same
 * `?task=` param `useOpenTask` has always used — there is no notification-owned
 * detail view to keep in step with the real one. An invitation goes to the
 * board too, because accepting is done from the sidebar's Invitations list and
 * the board is what the invite is *about*.
 *
 * Returns null when there is nothing to open: a notification whose entity has
 * since been deleted, or whose board has. The row still renders — it is a
 * record of something that happened — it just does not pretend to be a link.
 */
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

/**
 * The sentence a row renders.
 *
 * Built here rather than in the component so the wording is testable and so the
 * two types cannot drift into two different grammars. The actor falls back to
 * "Someone" rather than rendering an empty string — an account deleted since
 * the event leaves `actor_id` null by design.
 */
export function notificationText(notification: Notification): {
  title: string;
  detail: string;
} {
  const actor = notification.payload.actor_name || "Someone";
  const board = notification.payload.board_title || "a board";

  if (notification.type === "invite") {
    return {
      title: `${actor} invited you to ${board}`,
      detail: notification.payload.role
        ? `As ${notification.payload.role}`
        : "Board invitation",
    };
  }

  return {
    title: `${actor} assigned you ${notification.payload.todo_title || "a task"}`,
    detail: board,
  };
}

/**
 * The invitation a notification refers to, if it refers to one at all (M23).
 *
 * The inbox stores the invite's **id** in `entity_id` and never its token — a
 * token is a credential, and putting one in a row every client fetches would
 * make the inbox a place invitations could be redeemed from by anyone who
 * could read it. The token comes from `my_pending_invites`, which is scoped to
 * the caller by their own address inside the RPC; this is the id to match it
 * on.
 *
 * Null for every other notification type, and null for an invite row whose
 * `entity_id` is missing — that is possible because `entity_id` is deliberately
 * not a foreign key, so the row outlives the invitation it describes.
 */
export function inviteIdOf(notification: Notification): string | null {
  if (notification.type !== "invite") return null;

  return notification.entity_id ?? null;
}
