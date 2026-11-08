import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { FolderIcon, KanbanIcon, ListFilterIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { filterPath, type FilterDefinition } from "@/services/filters/registry";
import { spaceKeyOf } from "@/services/sidebar/layout";
import type { SpaceGroup } from "@/services/spaces/groupBoards";

interface FlyoutLink {
  key: string;
  to: string;
  label: string;
  active: boolean;
}

export default function CollapsedNav({
  groups,
  filters,
}: {
  groups: SpaceGroup[];
  filters: FilterDefinition[];
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const isAt = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <SidebarGroup className="border-hairline mt-1 border-t pt-2">
      <SidebarMenu>
        {groups.map((group) => {
          const links = group.boards.map((board) => ({
            key: board.id,
            to: `/boards/${board.id}`,
            label: board.title || t("common.untitledBoard"),
            active: isAt(`/boards/${board.id}`),
          }));

          return (
            <SidebarMenuItem key={spaceKeyOf(group)}>
              <Flyout
                label={group.space?.title ?? t("common.unfiled")}
                icon={
                  group.space ? (
                    <span className="bg-brand-soft text-brand text-micro grid size-4 shrink-0 place-items-center rounded font-bold">
                      {group.space.title.trim().charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <FolderIcon />
                  )
                }
                links={links}
                empty={t("sidebar.noBoards")}
                linkIcon={<KanbanIcon />}
              />
            </SidebarMenuItem>
          );
        })}

        <SidebarMenuItem>
          <Flyout
            label={t("sidebar.filters")}
            icon={<ListFilterIcon />}
            links={filters.map((definition) => ({
              key: definition.id,
              to: filterPath(definition.id),
              label: t(definition.labelKey),
              active: pathname === filterPath(definition.id),
            }))}
            empty=""
            linkIcon={<ListFilterIcon />}
          />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

function Flyout({
  label,
  icon,
  links,
  empty,
  linkIcon,
}: {
  label: string;
  icon: ReactNode;
  links: FlyoutLink[];
  empty: string;
  linkIcon: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            tooltip={label}
            aria-label={label}
            isActive={links.some((link) => link.active)}
          />
        }
      >
        {icon}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-60"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>

          {links.length === 0 ? (
            <p className="text-ink-3 text-meta px-2 py-1.5">{empty}</p>
          ) : (
            links.map((link) => (
              <DropdownMenuItem
                key={link.key}
                render={<Link to={link.to} />}
                aria-current={link.active ? "page" : undefined}
                className={link.active ? "bg-brand-soft text-ink" : undefined}
              >
                {linkIcon}
                <span className="truncate">{link.label}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
