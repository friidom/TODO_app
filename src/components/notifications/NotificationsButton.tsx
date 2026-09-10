import { useEffect, useState } from "react";
import { BellIcon } from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { useUnreadCount } from "@/services/notifications/useNotifications";
import { cn } from "@/utils/cn";
import NotificationsPanel from "./NotificationsPanel";

export default function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();

  useEffect(() => {
    if (!open) return;

    function handleEscape(e: KeyboardEvent) {
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

          {unread > 0 && (
            <span className="bg-brand text-brand-fg text-micro ml-auto rounded px-1.5 leading-4 font-semibold tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>

      {open && (
        <>
          <div
            aria-hidden
            onMouseDown={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 md:bg-transparent"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="border-hairline bg-surface rounded-surface fixed z-50 overflow-hidden border shadow-e3 max-md:inset-x-4 max-md:top-16 md:top-20 md:left-[calc(var(--sidebar-width,16rem)+0.5rem)]"
          >
            <NotificationsPanel onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}
