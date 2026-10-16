import { useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  CircleUserIcon,
  CircleUserRoundIcon,
  type LucideIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ShieldIcon,
  SquareKanbanIcon,
} from "lucide-react";

import { DragChip } from "@/components/dnd/DropLine";
import ReorderContext from "@/components/dnd/ReorderContext";
import type { ReorderMove } from "@/components/dnd/reorderDnd";
import NotificationsButton from "@/components/notifications/NotificationsButton";
import IconButton from "@/components/ui/IconButton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/SideBarUI/sidebar";
import { useSidebar } from "@/components/ui/SideBarUI/use-sidebar";
import { useAuth } from "@/services/auth/useAuth";
import { useBoards } from "@/services/boards/useBoards";
import { filterDefinitions, isFilterId } from "@/services/filters/registry";
import { useProfile } from "@/services/profile/useProfile";
import {
  SIDEBAR_DND,
  arrangeGroups,
  isSidebarSection,
  orderBy,
  spaceKeyOf,
  toggleCollapsed,
  type SidebarLayout,
  type SidebarList,
} from "@/services/sidebar/layout";
import { groupBoardsBySpace } from "@/services/spaces/groupBoards";
import { useSpaces } from "@/services/spaces/useSpaces";
import { useSidebarLayout } from "@/stores/sidebarLayout";
import type { IBoard, ISpace } from "@/types/data";
import { reorder, step } from "@/utils/reorder";
import BoardsSection from "./BoardsSection";
import CollapsedNav from "./CollapsedNav";
import FiltersSection from "./FiltersSection";

const NO_BOARDS: IBoard[] = [];
const NO_SPACES: ISpace[] = [];

type Item = {
  labelKey: string;
  icon: LucideIcon;
  to: string;
};

const FOR_YOU: Item = {
  labelKey: "sidebar.forYou",
  icon: CircleUserRoundIcon,
  to: "/",
};

const ADMIN: Item = {
  labelKey: "sidebar.superadmin",
  icon: ShieldIcon,
  to: "/admin",
};

function NavItem({ item }: { item: Item }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const location = useLocation();
  const label = t(item.labelKey);

  // explicit pathname comparison, exact — so For You at "/" isn't "active" on every board URL
  const isActive = location.pathname === item.to;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={item.to} />}
        isActive={isActive}
        tooltip={label}
      >
        <Icon />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const { user } = useAuth();
  const { state, isMobile, toggleSidebar } = useSidebar();

  // the phone's sheet always shows the full tree; only the desktop rail is icons
  const rail = state === "collapsed" && !isMobile;

  const { data: boards = NO_BOARDS, isPending } = useBoards();
  const { data: spaces = NO_SPACES } = useSpaces();

  const layout = useSidebarLayout((store) => store.layout);
  const update = useSidebarLayout((store) => store.update);

  const groups = useMemo(
    () => arrangeGroups(groupBoardsBySpace(boards, spaces), layout),
    [boards, spaces, layout],
  );

  const filters = useMemo(
    () =>
      orderBy(
        filterDefinitions(),
        layout.filters,
        (definition) => definition.id,
      ),
    [layout.filters],
  );

  const [announcement, setAnnouncement] = useState("");

  const labels = useMemo(() => {
    const names = new Map<string, string>([
      ["spaces", t("sidebar.spaces")],
      ["filters", t("sidebar.filters")],
    ]);

    for (const group of groups) {
      if (group.space) names.set(group.space.id, group.space.title);

      for (const board of group.boards) {
        names.set(board.id, board.title || t("common.untitledBoard"));
      }
    }

    for (const definition of filters) {
      names.set(definition.id, t(definition.labelKey));
    }

    return names;
  }, [groups, filters, t]);

  // A move rearranges the list as it is on screen, so an id the saved order
  // never had lands where it showed rather than jumping to the end.
  function idsOf(list: SidebarList, container?: string): string[] {
    switch (list) {
      case "section":
        return layout.sections;
      case "space":
        return groups.filter((group) => group.space).map(spaceKeyOf);
      case "board":
        return (
          groups
            .find((group) => spaceKeyOf(group) === container)
            ?.boards.map((board) => board.id) ?? []
        );
      case "filter":
        return filters.map((definition) => definition.id);
    }
  }

  function save(list: SidebarList, ids: string[], container?: string) {
    update((current): SidebarLayout => {
      switch (list) {
        case "section":
          return { ...current, sections: ids.filter(isSidebarSection) };
        case "space":
          return { ...current, spaces: ids };
        case "board":
          return container
            ? { ...current, boards: { ...current.boards, [container]: ids } }
            : current;
        case "filter":
          return { ...current, filters: ids.filter(isFilterId) };
      }
    });
  }

  function onReorder({ activeId, overId, side, data }: ReorderMove) {
    const list = (Object.keys(SIDEBAR_DND) as SidebarList[]).find(
      (key) => SIDEBAR_DND[key] === data.group,
    );

    if (!list || !side) return;

    save(
      list,
      reorder(idsOf(list, data.container), activeId, overId, side),
      data.container,
    );
  }

  function onStep(
    list: SidebarList,
    id: string,
    delta: -1 | 1,
    container?: string,
  ) {
    const ids = step(idsOf(list, container), id, delta);

    if (!ids) return;

    save(list, ids, container);

    setAnnouncement(
      t("sidebar.movedTo", {
        name: labels.get(id) ?? "",
        position: ids.indexOf(id) + 1,
        count: ids.length,
      }),
    );
  }

  const toggle = (key: string) =>
    update((current) => toggleCollapsed(current, key));

  return (
    <Sidebar collapsible="icon" className="border-hairline border-r" {...props}>
      <SidebarHeader className="px-3 py-3 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="focus-visible:ring-brand rounded-control flex min-w-0 flex-1 items-center gap-2.5 outline-none group-data-[collapsible=icon]:hidden focus-visible:ring-2"
          >
            <span className="bg-brand text-brand-fg rounded-control shadow-e1 grid size-7 shrink-0 place-items-center">
              <SquareKanbanIcon className="size-4" />
            </span>

            <span className="text-ink font-wordmark truncate text-base font-semibold tracking-tight">
              Veylo
            </span>
          </Link>

          <IconButton
            label={t(
              rail ? "sidebar.expandSidebar" : "sidebar.collapseSidebar",
            )}
            tooltipSide={rail ? "right" : "bottom"}
            onClick={toggleSidebar}
            className="group-data-[collapsible=icon]:mx-auto"
          >
            {rail ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
          </IconButton>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 group-data-[collapsible=icon]:overflow-y-auto">
        <SidebarGroup>
          <SidebarMenu>
            <NavItem item={FOR_YOU} />

            {user?.org_role === "superadmin" && <NavItem item={ADMIN} />}

            <NotificationsButton />
          </SidebarMenu>
        </SidebarGroup>

        {rail ? (
          <CollapsedNav groups={groups} filters={filters} />
        ) : (
          <ReorderContext
            onReorder={onReorder}
            renderOverlay={(id) => <DragChip>{labels.get(id)}</DragChip>}
            describe={(id) => labels.get(id) ?? id}
          >
            {layout.sections.map((section) =>
              section === "spaces" ? (
                <BoardsSection
                  key={section}
                  groups={groups}
                  loading={isPending}
                  open={!layout.collapsed.includes(section)}
                  collapsed={layout.collapsed}
                  onToggle={toggle}
                  onStep={onStep}
                />
              ) : (
                <FiltersSection
                  key={section}
                  filters={filters}
                  open={!layout.collapsed.includes(section)}
                  onToggle={() => toggle(section)}
                  onStep={onStep}
                />
              ),
            )}
          </ReorderContext>
        )}

        <p role="status" className="sr-only">
          {announcement}
        </p>
      </SidebarContent>

      <SidebarFooter className="border-hairline border-t p-2.5 group-data-[collapsible=icon]:p-2">
        <NavLink
          to="/profile"
          title={t("sidebar.profile")}
          className="hover:bg-wash focus-visible:ring-brand rounded-control flex min-w-0 items-center gap-2.5 p-1.5 transition-colors duration-150 outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0.5 focus-visible:ring-2"
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

          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="text-ink text-meta block truncate font-medium">
              {profile?.username || t("sidebar.account")}
            </span>
            <span className="text-ink-3 text-mini block truncate">
              {user?.email}
            </span>
          </span>
        </NavLink>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
