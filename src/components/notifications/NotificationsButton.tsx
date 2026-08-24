import { useEffect, useState } from "react";
import { BellIcon } from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { useUnreadCount } from "@/services/notifications/useNotifications";
import { cn } from "@/utils/cn";
import NotificationsPanel from "./NotificationsPanel";

/**
 * The bell, and the panel it opens (M22).
 *
 * **In the sidebar's workspace group beside For You**, because that is where
 * this product keeps things that are *yours* rather than a board's. It is not
 * in a board header for the same reason the For You page's queries take no
 * board id: a notification arrives whichever board you happen to have open.
 *
 * **Not `?panel=`.** That mechanism is board-scoped by design — it lives in
 * `ViewShell`'s drawer slot, which the profile page and For You do not have —
 * so routing the inbox through it would mean giving every page a drawer slot to
 * serve one global control. Local state and a fixed overlay is the smaller
 * answer, and the panel is not a place you navigate to.
 *
 * **The overlay is anchored on desktop and centred on a phone.** Below `md` the
 * sidebar is offcanvas, so a panel pinned to the rail would open against an
 * edge that is not on screen.
 */
export default function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();

  useEffect(() => {
    if (!open) return;

    function handleEscape(e: KeyboardEvent) {
      // Deferred to whatever is on top, the rule `Modal` and `Drawer` follow.
      if (e.key === "Escape" && !e.defaultPrevented) setOpen(false);
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "h-9 text-sm transition-colors duration-150",
            open ? "bg-elevated text-ink font-medium" : "text-ink-2",
            "hover:bg-ink/[0.04]",
          )}
        >
          <BellIcon
            className={cn("size-[18px] shrink-0", open && "text-brand")}
          />
          <span>Notifications</span>

          {/* The count, capped so a neglected inbox cannot widen the rail.
              `ml-auto` rather than a corner dot: the rail has room for the
              number, and the number is the useful part. */}
          {unread > 0 && (
            <span className="bg-brand text-brand-fg text-micro ml-auto rounded px-1.5 leading-4 font-semibold tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>

      {open && (
        <>
          {/* `onMouseDown`, matching `Modal`: a click that starts inside the
              panel and finishes out here — a selection dragged past the edge —
              is not a dismissal. */}
          <div
            aria-hidden
            onMouseDown={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 md:bg-transparent"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="border-hairline bg-surface rounded-surface fixed z-50 overflow-hidden border shadow-[0_16px_40px_-16px_rgba(0,0,0,0.5)] max-md:inset-x-4 max-md:top-16 md:top-20 md:left-[calc(var(--sidebar-width,16rem)+0.5rem)]"
          >
            <NotificationsPanel onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}
