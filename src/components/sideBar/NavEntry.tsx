import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";

import NotificationsButton from "@/components/notifications/NotificationsButton";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import type { SidebarNavItem } from "@/services/sidebar/layout";
import type { IBoard } from "@/types/data";
import { NAV_ITEMS } from "./navItems";
import RecentNav from "./RecentNav";
import StarredNav from "./StarredNav";

export default function NavEntry({
  id,
  boards,
}: {
  id: SidebarNavItem;
  boards: IBoard[];
}) {
  switch (id) {
    case "recent":
      return <RecentNav />;
    case "starred":
      return <StarredNav boards={boards} />;
    case "notifications":
      return <NotificationsButton />;
    case "for-you":
      return <NavLinkItem id={id} to="/" />;
    case "admin":
      return <NavLinkItem id={id} to="/admin" />;
  }
}

function NavLinkItem({ id, to }: { id: SidebarNavItem; to: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { labelKey, icon: Icon } = NAV_ITEMS[id];
  const label = t(labelKey);

  // exact, so For You at "/" isn't "active" on every board URL
  const isActive = pathname === to;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={to} />}
        isActive={isActive}
        tooltip={label}
      >
        <Icon />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
