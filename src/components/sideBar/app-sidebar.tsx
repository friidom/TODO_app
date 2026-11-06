import { lazy, Suspense, useMemo, useState } from "react";
import { Link, NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import {
  CircleUserIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Settings2Icon,
  SquareKanbanIcon,
} from "lucide-react";

import { DragChip } from "@/components/dnd/DropLine";
import ReorderContext from "@/components/dnd/ReorderContext";
import type { ReorderMove } from "@/components/dnd/reorderDnd";
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
import { FILTER_DEFINITIONS } from "@/services/filters/registry";
import { useProfile } from "@/services/profile/useProfile";
import {
  arrangeGroups,
  idsOf,
  moved,
  sidebarListOf,
  sidebarView,
  toggleCollapsed,
  withOrder,
  type SidebarList,
} from "@/services/sidebar/layout";
import { groupBoardsBySpace } from "@/services/spaces/groupBoards";
import { useSpaces } from "@/services/spaces/useSpaces";
import { useSidebarLayout } from "@/stores/sidebarLayout";
import type { IBoard, ISpace } from "@/types/data";
import { step } from "@/utils/reorder";
import BoardsSection from "./BoardsSection";
import CollapsedNav from "./CollapsedNav";
import FiltersSection from "./FiltersSection";
import MoreSection from "./MoreSection";
import NavEntry from "./NavEntry";

const CustomizeSidebarDialog = lazy(() => import("./CustomizeSidebarDialog"));

const NO_BOARDS: IBoard[] = [];
const NO_SPACES: ISpace[] = [];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const { user } = useAuth();
  const { state, isMobile, toggleSidebar, setOpen, setOpenMobile } =
    useSidebar();

  // the phone's sheet always shows the full tree; only the desktop rail is icons
  const rail = state === "collapsed" && !isMobile;

  const { data: boards = NO_BOARDS, isPending } = useBoards();
  const { data: spaces = NO_SPACES } = useSpaces();

  const { layout, update } = useSidebarLayout();
  const admin = user?.org_role === "superadmin";

  const groups = useMemo(
    () => arrangeGroups(groupBoardsBySpace(boards, spaces), layout),
    [boards, spaces, layout],
  );

  const view = useMemo(
    () => sidebarView(layout, groups, admin),
    [layout, groups, admin],
  );

  const filters = useMemo(
    () => view.filters.map((id) => FILTER_DEFINITIONS[id]),
    [view.filters],
  );

  const hidden = useMemo(() => new Set(layout.hidden), [layout.hidden]);

  const hasMore =
    view.more.nav.length + view.more.groups.length + view.more.filters.length >
    0;

  const [moreOpen, setMoreOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
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

    for (const definition of Object.values(FILTER_DEFINITIONS)) {
      names.set(definition.id, t(definition.labelKey));
    }

    return names;
  }, [groups, t]);

  function onReorder({ activeId, overId, side, data }: ReorderMove) {
    const list = sidebarListOf(data.group);

    if (!list || !side) return;

    update((current) =>
      moved(current, groups, list, {
        activeId,
        overId,
        side,
        container: data.container,
      }),
    );
  }

  function onStep(
    list: SidebarList,
    id: string,
    delta: -1 | 1,
    container?: string,
  ) {
    const ids = step(idsOf(list, layout, groups, container), id, delta, hidden);

    if (!ids) return;

    update((current) => withOrder(current, list, ids, container));

    const shown = ids.filter((it) => !hidden.has(it));

    setAnnouncement(
      t("sidebar.movedTo", {
        name: labels.get(id) ?? "",
        position: shown.indexOf(id) + 1,
        count: shown.length,
      }),
    );
  }

  const toggle = (key: string) =>
    update((current) => toggleCollapsed(current, key));

  // On a phone the sidebar is a modal sheet whose focus trap would fight the dialog's.
  function customize() {
    setOpenMobile(false);
    setCustomizing(true);
  }

  function showMore() {
    setMoreOpen(true);
    setOpen(true);
  }

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="border-hairline border-r"
        {...props}
      >
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
          {view.nav.length > 0 && (
            <SidebarGroup>
              <SidebarMenu>
                {view.nav.map((id) => (
                  <NavEntry key={id} id={id} boards={boards} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          )}

          {rail ? (
            <CollapsedNav groups={view.groups} filters={filters}>
              {hasMore && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={t("sidebar.more")}
                    aria-label={t("sidebar.more")}
                    onClick={showMore}
                  >
                    <MoreHorizontalIcon />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </CollapsedNav>
          ) : (
            <>
              <ReorderContext
                onReorder={onReorder}
                renderOverlay={(id) => <DragChip>{labels.get(id)}</DragChip>}
                describe={(id) => labels.get(id) ?? id}
              >
                {view.sections.map((section) =>
                  section === "spaces" ? (
                    <BoardsSection
                      key={section}
                      groups={view.groups}
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

              {hasMore && (
                <MoreSection
                  more={view.more}
                  boards={boards}
                  open={moreOpen}
                  onToggle={() => setMoreOpen((open) => !open)}
                />
              )}
            </>
          )}

          <p role="status" className="sr-only">
            {announcement}
          </p>
        </SidebarContent>

        <SidebarFooter className="border-hairline border-t p-2.5 group-data-[collapsible=icon]:p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={customize}
                aria-haspopup="dialog"
                tooltip={t("sidebar.customize")}
              >
                <Settings2Icon />
                <span>{t("sidebar.customize")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

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

      {customizing && (
        <Suspense fallback={null}>
          <CustomizeSidebarDialog onClose={() => setCustomizing(false)} />
        </Suspense>
      )}
    </>
  );
}
