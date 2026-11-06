import {
  BellIcon,
  CircleUserRoundIcon,
  ClockIcon,
  ShieldIcon,
  StarIcon,
  type LucideIcon,
} from "lucide-react";

import type { SidebarNavItem } from "@/services/sidebar/layout";

export const NAV_ITEMS: Record<
  SidebarNavItem,
  { labelKey: string; icon: LucideIcon }
> = {
  "for-you": { labelKey: "sidebar.forYou", icon: CircleUserRoundIcon },
  recent: { labelKey: "recent.title", icon: ClockIcon },
  starred: { labelKey: "starred.title", icon: StarIcon },
  admin: { labelKey: "sidebar.superadmin", icon: ShieldIcon },
  notifications: { labelKey: "notifications.title", icon: BellIcon },
};
