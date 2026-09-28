import { NavLink, useLocation } from "react-router";
import {
  CircleUserIcon,
  CircleUserRoundIcon,
  type LucideIcon,
  ShieldIcon,
  SquareKanbanIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import BoardsSection from "./BoardsSection";
import FiltersSection from "./FiltersSection";
import NotificationsButton from "@/components/notifications/NotificationsButton";
import { useAuth } from "@/services/auth/useAuth";
import { useProfile } from "@/services/profile/useProfile";

type Item = {
  label: string;
  icon: LucideIcon;
  // present only when a route exists — absent means placeholder
  to?: string;
};

const WORKSPACE: Item[] = [
  { label: "For You", icon: CircleUserRoundIcon, to: "/" },
  // { label: "Dashboard", icon: SquareKanbanIcon },
];

const ADMIN: Item = { label: "Superadmin", icon: ShieldIcon, to: "/admin" };

function NavItem({ item }: { item: Item }) {
  const Icon = item.icon;
  const location = useLocation();

  if (!item.to) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-disabled
          title={`${item.label} — not built yet`}
          className="cursor-default"
        >
          <Icon />
          <span>{item.label}</span>
          <span className="bg-wash-strong text-micro ml-auto rounded px-1.5 py-0.5 font-medium">
            Soon
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // explicit pathname comparison, exact — so For You at "/" isn't "active" on every board URL
  const isActive = location.pathname === item.to;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton render={<NavLink to={item.to} />} isActive={isActive}>
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: profile } = useProfile();
  const { user } = useAuth();

  return (
    <Sidebar className="border-hairline border-r" {...props}>
      <SidebarHeader className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand text-brand-fg rounded-control shadow-e1 grid size-7 place-items-center">
            <SquareKanbanIcon className="size-4" />
          </span>

          <span className="text-ink font-wordmark text-base font-semibold tracking-tight">
            Veylo
          </span>
        </div>

        {/* no collapse trigger here — sidebar is collapsible="offcanvas", so a trigger inside would hide with it */}
      </SidebarHeader>

      <SidebarContent className="gap-2">
        <SidebarGroup>
          <SidebarMenu>
            {WORKSPACE.map((item) => (
              <NavItem key={item.label} item={item} />
            ))}

            {user?.org_role === "superadmin" && <NavItem item={ADMIN} />}

            <NotificationsButton />
          </SidebarMenu>
        </SidebarGroup>

        <BoardsSection />

        <FiltersSection />
      </SidebarContent>

      <SidebarFooter className="border-hairline border-t p-2.5">
        <div className="flex items-center">
          <NavLink
            to="/profile"
            title="Profile and preferences"
            className="hover:bg-wash focus-visible:ring-brand rounded-control flex min-w-0 flex-1 items-center gap-2.5 p-1.5 transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="bg-wash-strong text-ink-2 grid size-7 shrink-0 place-items-center rounded-full">
                <CircleUserIcon className="size-4" />
              </span>
            )}

            <span className="min-w-0 flex-1">
              <span className="text-ink text-meta block truncate font-medium">
                {profile?.username || "Account"}
              </span>
              <span className="text-ink-3 text-mini block truncate">
                {user?.email}
              </span>
            </span>
          </NavLink>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
