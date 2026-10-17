import { lazy, Suspense, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";
import { ChevronRightIcon, KanbanIcon, StarIcon } from "lucide-react";

import StarButton from "@/components/stars/StarButton";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/SideBarUI/sidebar";
import { useSidebarFlyout } from "@/hooks/useSidebarFlyout";
import { toggleCollapsed } from "@/services/sidebar/layout";
import { starredBoards } from "@/services/stars/starred";
import { useStarred } from "@/services/stars/useStars";
import { useSidebarLayout } from "@/stores/sidebarLayout";
import type { IBoard } from "@/types/data";
import { cn } from "@/utils/cn";
import { Collapse } from "./Section";
import SidebarFlyout from "./SidebarFlyout";
import { PanelLoading } from "./SidebarFlyout";

const StarredPanel = lazy(() => import("./StarredPanel"));

const INLINE = 8;
const KEY = "starred";

export default function StarredNav({ boards }: { boards: IBoard[] }) {
  const { t } = useTranslation();
  const flyout = useSidebarFlyout();
  const location = useLocation();
  const { data: stars = [] } = useStarred();

  const open = useSidebarLayout(
    (store) => !store.layout.collapsed.includes(KEY),
  );
  const update = useSidebarLayout((store) => store.update);

  const starred = useMemo(() => starredBoards(boards, stars), [boards, stars]);
  const inline = starred.slice(0, INLINE);

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={flyout.show}
          aria-haspopup="dialog"
          aria-expanded={flyout.phase === "open"}
          tooltip={t("starred.title")}
          className={cn("pr-8", flyout.visible && "bg-wash-strong text-ink")}
        >
          <StarIcon />
          <span>{t("starred.title")}</span>
        </SidebarMenuButton>

        {starred.length > 0 && (
          <SidebarMenuAction
            onClick={() => update((current) => toggleCollapsed(current, KEY))}
            aria-expanded={open}
            aria-label={t(open ? "starred.collapse" : "starred.expand")}
            title={t(open ? "starred.collapse" : "starred.expand")}
          >
            <ChevronRightIcon
              className={cn(
                "transition-transform duration-200",
                open && "rotate-90",
              )}
            />
          </SidebarMenuAction>
        )}

        {starred.length > 0 && (
          <Collapse open={open}>
            <SidebarMenuSub className="mt-0.5">
              {inline.map((board) => {
                const to = `/boards/${board.id}`;
                const title = board.title || t("common.untitledBoard");
                const active =
                  location.pathname === to ||
                  location.pathname.startsWith(`${to}/`);

                return (
                  <SidebarMenuSubItem key={board.id}>
                    <SidebarMenuSubButton
                      render={<NavLink to={to} />}
                      isActive={active}
                      title={title}
                      className="pr-8"
                    >
                      <KanbanIcon />
                      <span>{title}</span>
                    </SidebarMenuSubButton>

                    <StarButton
                      boardId={board.id}
                      size="xs"
                      tooltipSide="right"
                      className="coarse:opacity-100 absolute top-0.5 right-0.5 opacity-0 transition-opacity duration-150 group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100"
                    />
                  </SidebarMenuSubItem>
                );
              })}

              {starred.length > INLINE && (
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    render={<button type="button" onClick={flyout.show} />}
                    size="sm"
                    className="text-ink-3 w-full"
                  >
                    <span>
                      {t("starred.showAll", { count: starred.length })}
                    </span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )}
            </SidebarMenuSub>
          </Collapse>
        )}
      </SidebarMenuItem>

      <SidebarFlyout
        phase={flyout.phase}
        anchor={flyout.anchor}
        panelRef={flyout.panelRef}
        onHide={flyout.hide}
        label={t("starred.title")}
      >
        <Suspense fallback={<PanelLoading />}>
          <StarredPanel onClose={flyout.hide} />
        </Suspense>
      </SidebarFlyout>
    </>
  );
}
