import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  BellIcon,
  CheckCheckIcon,
  CircleAlertIcon,
  MailIcon,
  UserPlusIcon,
} from "lucide-react";

import { HEADER_CONTROL_ACTIVE } from "@/components/board/headerControl";
import InviteActions from "@/components/notifications/InviteActions";
import type { MyInvite } from "@/services/invites/invitesApi";
import { useMyInvites } from "@/services/invites/useMyInvites";
import {
  filterNotifications,
  isUnread,
  notificationTarget,
  notificationText,
  inviteIdOf,
  NOTIFICATION_TABS,
  NOTIFICATION_TAB_LABELS,
  unreadCount,
  type Notification,
  type NotificationTab,
} from "@/services/notifications/notifications";
import {
  useMarkRead,
  useNotifications,
} from "@/services/notifications/useNotifications";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

/**
 * The inbox itself (M22).
 *
 * **A panel anchored to the bell, not a page.** Notifications are read in
 * passing — you glance, you open the one that matters, you carry on — and a
 * route would mean leaving whatever you were doing to check whether anything
 * had happened. It is the same argument `useOpenTask` makes for the task detail
 * being a modal over the board rather than a page.
 *
 * **Clicking a row marks it read and navigates in one gesture.** Making "mark
 * read" a separate deliberate act is how inboxes end up with a permanent unread
 * badge nobody can clear; you have read it, you are looking at it.
 */
export default function NotificationsPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [tab, setTab] = useState<NotificationTab>("all");

  const navigate = useNavigate();
  const { data: notifications = [], isLoading, error } = useNotifications();
  const markRead = useMarkRead();

  /**
   * The invitations that are still pending, keyed by invite id.
   *
   * `notifications.entity_id` is the invite's id; `my_pending_invites` returns
   * the token the accept/decline RPCs take. This map is the join between them,
   * and it is the single source of "is this still actionable" — an invitation
   * that has been accepted, declined, revoked or expired is simply absent from
   * the RPC's result, so no per-row expiry check is needed here.
   */
  const { data: pendingInvites = [], isPending: invitesPending } =
    useMyInvites();

  const inviteById = useMemo(
    () => new Map<string, MyInvite>(pendingInvites.map((i) => [i.id, i])),
    [pendingInvites],
  );

  const rows = useMemo(
    () => filterNotifications(notifications, tab),
    [notifications, tab],
  );

  const unread = unreadCount(notifications);

  function open(notification: Notification) {
    if (isUnread(notification)) markRead.mutate([notification.id]);

    const target = notificationTarget(notification);

    // A row whose board or task has since been deleted still renders — it is a
    // record of something that happened — but it does not pretend to be a link.
    if (target) {
      navigate(target);
      onClose();
    }
  }

  return (
    <div className="flex max-h-[min(30rem,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col">
      <div className="border-hairline flex items-center gap-2 border-b px-3 py-2.5">
        <h2 className="text-ink text-[13px] font-semibold">Notifications</h2>

        {unread > 0 && (
          <span className="bg-brand text-brand-fg rounded px-1.5 text-[10px] leading-4 font-semibold tabular-nums">
            {unread}
          </span>
        )}

        {unread > 0 && (
          <button
            type="button"
            onClick={() => markRead.mutate("all")}
            className="text-ink-3 hover:text-ink focus-visible:ring-brand ml-auto flex items-center gap-1 rounded px-1 text-[11px] transition-colors outline-none focus-visible:ring-2"
          >
            <CheckCheckIcon className="size-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Filter notifications"
        className="border-hairline flex shrink-0 gap-0.5 border-b px-2 py-1.5"
      >
        {NOTIFICATION_TABS.map((value) => {
          const selected = tab === value;
          const count =
            value === "all"
              ? unread
              : unreadCount(filterNotifications(notifications, value));

          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-[5px] px-2 text-[12px] leading-7 whitespace-nowrap transition-colors duration-150 outline-none",
                "focus-visible:ring-brand focus-visible:ring-2",
                selected
                  ? HEADER_CONTROL_ACTIVE
                  : "text-ink-3 hover:text-ink hover:bg-ink/[0.06]",
              )}
            >
              {NOTIFICATION_TAB_LABELS[value]}

              {count > 0 && (
                <span
                  className={cn(
                    "rounded px-1 text-[10px] leading-4 font-semibold tabular-nums",
                    selected
                      ? "bg-brand text-brand-fg"
                      : "bg-ink/[0.08] text-ink-3",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <State
            icon={CircleAlertIcon}
            title="Couldn't load notifications"
            hint={error.message}
            tone="error"
          />
        ) : rows.length === 0 ? (
          <State
            icon={BellIcon}
            title={tab === "all" ? "You're all caught up" : "Nothing here"}
            hint={
              tab === "invite"
                ? "Board invitations addressed to you show up here."
                : tab === "assigned"
                  ? "When someone assigns you a task, you'll see it here."
                  : "Invitations and task assignments will appear here."
            }
          />
        ) : (
          <ul className="flex flex-col">
            {rows.map((notification) => (
              <Row
                key={notification.id}
                notification={notification}
                invite={(() => {
                  const id = inviteIdOf(notification);

                  return id ? (inviteById.get(id) ?? null) : null;
                })()}
                invitesPending={invitesPending}
                onOpen={() => open(notification)}
                onAccepted={(boardId) => {
                  navigate(`/boards/${boardId}`);
                  onClose();
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({
  notification,
  invite,
  invitesPending,
  onOpen,
  onAccepted,
}: {
  notification: Notification;
  /** Present only for an invitation that can still be acted on. */
  invite: MyInvite | null;
  /** The pending list has not answered yet, so `invite: null` means nothing. */
  invitesPending: boolean;
  onOpen: () => void;
  onAccepted: (boardId: string) => void;
}) {
  const { title, detail } = notificationText(notification);
  const unread = isUnread(notification);

  const Icon = notification.type === "invite" ? MailIcon : UserPlusIcon;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-ink/[0.04] focus-visible:ring-brand flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 outline-none focus-visible:ring-2"
      >
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
            notification.type === "invite"
              ? "bg-brand-soft text-brand"
              : "bg-status-blue/15 text-status-blue",
          )}
        >
          <Icon className="size-3.5" />
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[12.5px] leading-snug",
              // Weight rather than colour carries unread: a coloured row would
              // compete with the type chip beside it, and dimming read rows
              // makes a caught-up inbox look broken.
              unread ? "text-ink font-medium" : "text-ink-2",
            )}
          >
            {title}
          </span>

          <span className="text-ink-3 mt-0.5 block truncate text-[11px]">
            {detail} · {relativeTime(notification.created_at)}
          </span>
        </span>

        {/* The unread dot, and the only thing in the row that is purely state.
            Kept out of the text flow so a long title cannot push it off. */}
        {unread && (
          <span
            aria-label="Unread"
            className="bg-brand mt-1.5 size-1.5 shrink-0 rounded-full"
          />
        )}
      </button>

      {/* OUTSIDE the button, because a button inside a button is invalid HTML
          and the browser's own repair of it drops one of them — the same
          constraint `FeedRow` works around for its star. Indented to the text
          column so the actions read as belonging to this row's message rather
          than to the list. */}
      {notification.type === "invite" && (
        <div className="pr-2 pb-2 pl-[3.375rem]">
          <InviteActions
            invite={invite}
            pending={invitesPending}
            onSettled={onAccepted}
          />
        </div>
      )}
    </li>
  );
}

function Skeleton() {
  return (
    <ul className="animate-pulse flex-col gap-1 p-0.5">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="flex items-start gap-2.5 px-2 py-2">
          <span className="bg-ink/10 size-7 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span
              className="bg-ink/10 block h-3 rounded"
              style={{ width: `${60 + ((i * 11) % 30)}%` }}
            />
            <span className="bg-ink/10 mt-2 block h-2.5 w-24 rounded" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function State({
  icon: Icon,
  title,
  hint,
  tone = "empty",
}: {
  icon: typeof BellIcon;
  title: string;
  hint: string;
  tone?: "empty" | "error";
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
      <span
        className={cn(
          "mb-2 grid size-9 place-items-center rounded-full",
          tone === "error"
            ? "bg-status-red/10 text-status-red"
            : "bg-ink/[0.06] text-ink-3",
        )}
      >
        <Icon className="size-4" />
      </span>

      <p className="text-ink text-[13px] font-medium">{title}</p>
      <p className="text-ink-3 max-w-[16rem] text-xs leading-relaxed">{hint}</p>
    </div>
  );
}
