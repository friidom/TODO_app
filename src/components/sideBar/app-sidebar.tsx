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
import MyInvitations from "@/components/invites/MyInvitations";
import NotificationsButton from "@/components/notifications/NotificationsButton";
import { useProfile } from "@/services/profile/useProfile";
import { cn } from "@/utils/cn";

/**
 * The application's navigation rail.
 *
 * **Cut to what exists, in M17.** It used to carry three sections of mostly
 * inert entries — My Tasks, Boards, Members, Integrations, Reports, plus a
 * Views group listing Calendar and Timeline — so six placeholders outnumbered
 * the live items and the one thing the sidebar is *for*, the Spaces → Boards
 * tree, was the smallest thing in it.
 *
 * What is left: For You, Notifications, the board tree, and a footer.
 * Views moved to the board's own toolbar, where switching one does not mean
 * travelling to the sidebar and back.
 *
 * **The footer holds the account, and only the account.** Theme and language
 * lived here briefly and moved on to the profile page: a preference is
 * something you set once and then want out of the way, and two of them wedged
 * beside an avatar made the busiest corner of the sidebar the one carrying the
 * least-used controls. The profile row is the way to them.
 *
 * A *live* entry navigates because a route exists for it in
 * `components/routes/Routes.tsx`. A *placeholder* renders at lower contrast and
 * does not respond to a click — a placeholder that navigates to a 404 is worse
 * than one that visibly waits.
 */

type Item = {
  label: string;
  icon: LucideIcon;
  /** Present only when a route exists. Absent means placeholder. */
  to?: string;
};

const WORKSPACE: Item[] = [
  // "For You" as of M21, and not just a rename: `/` now renders the personal
  // hub rather than redirecting to whichever board happened to be oldest.
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
          <span className="bg-elevated text-ink-3/80 ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium">
            Soon
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // This vendored SidebarMenuButton is base-ui's `render` prop, not Radix's
  // `asChild`, so the link is passed as an element and the children below are
  // rendered into it. NavLink's own render-prop form is unavailable for the
  // same reason, hence the explicit pathname comparison — exact, so For You at
  // "/" is not active on every board URL.
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
          <span className="bg-brand text-brand-fg rounded-control grid size-7 place-items-center shadow-sm">
            <SquareKanbanIcon className="size-4" />
          </span>

          {/* The one place Josefin Sans survives (M17): a display face belongs
              on a logotype and nowhere near 12px board text. */}
          <span className="text-ink font-wordmark text-base font-semibold tracking-tight">
            KAN
          </span>
        </div>

        {/* No collapse trigger here, deliberately. This sidebar is
            `collapsible="offcanvas"`, so a collapsed sidebar is a sidebar with
            no width — a trigger inside it would hide with it and there would be
            no way back. It lives in `BoardIdentity` instead, which is always on
            screen. */}
      </SidebarHeader>

      <SidebarContent className="gap-1">
        <SidebarGroup className="py-1">
          <SidebarMenu>
            {WORKSPACE.map((item) => (
              <NavItem key={item.label} item={item} />
            ))}

            {/* Beside For You, because both answer "what is mine" rather than
                "what is on this board" (M22). */}
            <NotificationsButton />
          </SidebarMenu>
        </SidebarGroup>

        <MyInvitations />

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
              <span className="text-ink block truncate text-[13px] font-medium">
                {profile?.username || "Account"}
              </span>
              <span className="text-ink-3 block truncate text-[11px]">
                {profile?.email}
              </span>
            </span>
          </NavLink>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
