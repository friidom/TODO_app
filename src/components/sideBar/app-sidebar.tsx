import { NavLink, useLocation } from "react-router";
import {
  CircleUserIcon,
  CircleUserRoundIcon,
  type LucideIcon,
  SettingsIcon,
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
import NotificationsButton from "@/components/notifications/NotificationsButton";
import { useProfile } from "@/services/profile/useProfile";
import { cn } from "@/utils/cn";

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

function NavItem({ item }: { item: Item }) {
  const Icon = item.icon;
  const location = useLocation();

  if (!item.to) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-disabled
          title={`${item.label} — not built yet`}
          className="text-ink-3/70 h-9 cursor-default text-sm hover:bg-transparent hover:text-inherit"
        >
          <Icon className="size-[18px] shrink-0" />
          <span>{item.label}</span>
          <span className="bg-elevated text-ink-3/80 text-micro ml-auto rounded px-1.5 py-0.5 font-medium">
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
      <SidebarMenuButton
        render={<NavLink to={item.to} />}
        isActive={isActive}
        className={cn(
          "h-9 text-sm transition-colors duration-150",
          isActive
            ? "bg-elevated text-ink font-medium"
            : "text-ink-2 hover:bg-ink/[0.04]",
        )}
      >
        <Icon
          className={cn("size-[18px] shrink-0", isActive && "text-brand")}
        />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: profile } = useProfile();

  return (
    <Sidebar className="border-hairline border-r" {...props}>
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand text-brand-fg rounded-control grid size-7 place-items-center shadow-e1">
            <SquareKanbanIcon className="size-4" />
          </span>

          <span className="text-ink font-wordmark text-base font-semibold tracking-tight">
            Veylo
          </span>
        </div>

        {/* no collapse trigger here — sidebar is collapsible="offcanvas", so a trigger inside would hide with it */}
      </SidebarHeader>

      <SidebarContent className="gap-1">
        <SidebarGroup className="py-1">
          <SidebarMenu>
            {WORKSPACE.map((item) => (
              <NavItem key={item.label} item={item} />
            ))}

            <NotificationsButton />
          </SidebarMenu>
        </SidebarGroup>

        <BoardsSection />
      </SidebarContent>

      <SidebarFooter className="border-hairline gap-1 border-t p-2.5">
        <SidebarMenu>
          <NavItem item={{ label: "Settings", icon: SettingsIcon }} />
        </SidebarMenu>

        <div className="flex items-center">
          <NavLink
            to="/profile"
            title="Profile and preferences"
            className="hover:bg-elevated rounded-control flex min-w-0 flex-1 items-center gap-2.5 p-1.5 transition-colors duration-150"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="bg-elevated text-ink-2 grid size-7 shrink-0 place-items-center rounded-full">
                <CircleUserIcon className="size-4" />
              </span>
            )}

            <span className="min-w-0 flex-1">
              <span className="text-ink text-meta block truncate font-medium">
                {profile?.username || "Account"}
              </span>
              <span className="text-ink-3 text-mini block truncate">
                {profile?.email}
              </span>
            </span>
          </NavLink>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
