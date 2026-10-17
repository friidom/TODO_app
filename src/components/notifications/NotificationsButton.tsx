import { useTranslation } from "react-i18next";
import { BellIcon } from "lucide-react";

import SidebarFlyout from "@/components/sideBar/SidebarFlyout";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { useSidebarFlyout } from "@/hooks/useSidebarFlyout";
import { useUnreadCount } from "@/services/notifications/useNotifications";
import { cn } from "@/utils/cn";
import NotificationsPanel from "./NotificationsPanel";

export default function NotificationsButton() {
  const { t } = useTranslation();
  const flyout = useSidebarFlyout();
  const unread = useUnreadCount();

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={flyout.show}
          aria-haspopup="dialog"
          aria-expanded={flyout.phase === "open"}
          tooltip={t("notifications.title")}
          className={cn(flyout.visible && "bg-wash-strong text-ink")}
        >
          <BellIcon />
          <span>{t("notifications.title")}</span>

          {unread > 0 && (
            <>
              <span className="bg-brand text-brand-fg text-micro ml-auto rounded px-1.5 leading-4 font-semibold tabular-nums group-data-[collapsible=icon]:sr-only">
                {unread > 99 ? "99+" : unread}
              </span>

              <span
                aria-hidden
                className="bg-brand ring-rail absolute top-1.5 right-1.5 hidden size-2 rounded-full ring-2 group-data-[collapsible=icon]:block"
              />
            </>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarFlyout
        phase={flyout.phase}
        anchor={flyout.anchor}
        panelRef={flyout.panelRef}
        onHide={flyout.hide}
        label={t("notifications.title")}
      >
        <NotificationsPanel onClose={flyout.hide} />
      </SidebarFlyout>
    </>
  );
}
