import { NavLink, useLocation } from "react-router";
import {
  CalendarIcon,
  ChartNoAxesColumnIcon,
  CircleUserIcon,
  KanbanIcon,
  LayoutGridIcon,
  ListIcon,
  type LucideIcon,
  PlugIcon,
  SettingsIcon,
  SquareCheckIcon,
  UsersIcon,
  WaypointsIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView, type BoardViewMode } from "@/hooks/useBoardView";
import { useBoards } from "@/services/boards/useBoards";
import { useProfile } from "@/services/profile/useProfile";
import { cn } from "@/utils/cn";

/**
 * The application's navigation rail.
 *
 * Replaces the shadcn scaffold this file used to hold, which rendered fixed
 * sample data — "Playground", "Models", "Sales & Marketing" — none of it
 * connected to anything.
 *
 * **Two kinds of entry, and the difference is visible on purpose.** A *live*
 * entry navigates, because a route for it exists in `components/routes/Routes.tsx`:
 * that is Overview and each board. A *placeholder* renders at lower contrast and
 * does not respond to a click, because the page it names does not exist yet —
 * M3's UI tasks, then the later view milestones. A placeholder that navigates to
 * a 404 is worse than one that visibly waits.
 */

type Item = {
  label: string;
  icon: LucideIcon;
  /** Present only when a route exists. Absent means placeholder. */
  to?: string;
};

const WORKSPACE: Item[] = [
  { label: "Overview", icon: LayoutGridIcon, to: "/" },
  { label: "My Tasks", icon: SquareCheckIcon },
  { label: "Boards", icon: KanbanIcon },
];

/**
 * Still placeholders. Board and List are rendered above them by `ViewsSection`,
 * because their target depends on which board is open and on the view state
 * already in the URL — neither of which a static `to` can express.
 */
const VIEWS: Item[] = [
  { label: "Calendar", icon: CalendarIcon },
  { label: "Timeline", icon: WaypointsIcon },
  { label: "Reports", icon: ChartNoAxesColumnIcon },
];

const BOARD_VIEWS = [
  { label: "Board", icon: KanbanIcon, mode: "board" },
  { label: "List", icon: ListIcon, mode: "list" },
] as const satisfies readonly {
  label: string;
  icon: LucideIcon;
  mode: BoardViewMode;
}[];

const SETTINGS: Item[] = [
  { label: "Members", icon: UsersIcon },
  { label: "Integrations", icon: PlugIcon },
  { label: "Settings", icon: SettingsIcon },
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
          className="text-ink-3 cursor-default opacity-70 hover:bg-transparent hover:text-inherit"
        >
          <Icon className="size-4 shrink-0" />
          <span>{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // This vendored SidebarMenuButton is base-ui's `render` prop, not Radix's
  // `asChild`, so the link is passed as an element and the children below are
  // rendered into it. NavLink's own render-prop form is unavailable for the
  // same reason, hence the explicit pathname comparison — exact, so Overview at
  // "/" is not active on every board URL.
  const isActive = location.pathname === item.to;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={item.to} />}
        isActive={isActive}
        className={cn(isActive ? "text-ink font-medium" : "text-ink-2")}
      >
        <Icon className="size-4 shrink-0" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Board and List, plus the views that are still placeholders.
 *
 * These two are not ordinary nav entries. They address the *same* route as each
 * other — one board, two layouts — so which is active is a search param rather
 * than a pathname, and the link has to carry whatever filter, sort and grouping
 * are already set or switching views would silently throw them away. That is
 * also why they degrade to placeholders on a page with no board: there is
 * nothing to list.
 */
function ViewsSection() {
  const boardId = useBoardId();
  const { mode } = useBoardView();
  const location = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-ink-3 text-[11px] font-semibold tracking-[0.12em] uppercase">
        Views
      </SidebarGroupLabel>

      <SidebarMenu>
        {BOARD_VIEWS.map((item) => {
          if (!boardId) {
            return <NavItem key={item.label} item={item} />;
          }

          const params = new URLSearchParams(location.search);

          // `board` is the default, so it is the absence of the key — the same
          // rule `useBoardView` writes by.
          if (item.mode === "board") params.delete("view");
          else params.set("view", item.mode);

          const query = params.toString();
          const to = `/boards/${boardId}${query ? `?${query}` : ""}`;
          const isActive = mode === item.mode;
          const Icon = item.icon;

          return (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton
                render={<NavLink to={to} />}
                isActive={isActive}
                className={cn(isActive ? "text-ink font-medium" : "text-ink-2")}
              >
                <Icon
                  className={cn("size-4 shrink-0", isActive && "text-brand")}
                />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}

        {VIEWS.map((item) => (
          <NavItem key={item.label} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function Section({ label, items }: { label: string; items: Item[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-ink-3 text-[11px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </SidebarGroupLabel>

      <SidebarMenu>
        {items.map((item) => (
          <NavItem key={item.label} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { data: boards = [] } = useBoards();
  const { data: profile } = useProfile();
  const location = useLocation();

  return (
    <Sidebar className="border-hairline border-r" {...props}>
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand text-brand-fg grid size-8 place-items-center rounded-control shadow-sm">
            <KanbanIcon className="size-4" />
          </span>
          <span className="text-ink text-base font-semibold tracking-tight">
            KAN
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1">
        <Section label="Workspace" items={WORKSPACE} />

        <SidebarGroup>
          <SidebarGroupLabel className="text-ink-3 text-[11px] font-semibold tracking-[0.12em] uppercase">
            Boards
          </SidebarGroupLabel>

          <SidebarMenu>
            {boards.length === 0 ? (
              <SidebarMenuItem>
                <span className="text-ink-3 px-2 py-1.5 text-sm">
                  No boards yet
                </span>
              </SidebarMenuItem>
            ) : (
              boards.map((board) => {
                const to = `/boards/${board.id}`;
                const isActive = location.pathname === to;

                return (
                  <SidebarMenuItem key={board.id}>
                    <SidebarMenuButton
                      render={<NavLink to={to} />}
                      isActive={isActive}
                      className={cn(
                        isActive
                          ? "bg-brand-soft text-ink font-medium"
                          : "text-ink-2",
                      )}
                    >
                      <KanbanIcon
                        className={cn(
                          "size-4 shrink-0",
                          isActive && "text-brand",
                        )}
                      />
                      <span className="truncate">
                        {board.title || "Untitled board"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })
            )}
          </SidebarMenu>
        </SidebarGroup>

        <ViewsSection />
        <Section label="Settings" items={SETTINGS} />
      </SidebarContent>

      <SidebarFooter className="border-hairline border-t p-3">
        <NavLink
          to="/profile"
          className="hover:bg-elevated flex items-center gap-2.5 rounded-control p-1.5 transition-colors"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <span className="bg-elevated text-ink-2 grid size-8 place-items-center rounded-full">
              <CircleUserIcon className="size-4" />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate text-sm font-medium">
              {profile?.username || "Account"}
            </span>
            <span className="text-ink-3 block truncate text-xs">
              {profile?.email}
            </span>
          </span>
        </NavLink>
      </SidebarFooter>
    </Sidebar>
  );
}
