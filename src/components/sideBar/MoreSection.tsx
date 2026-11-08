import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";
import {
  ChevronRightIcon,
  FolderIcon,
  KanbanIcon,
  ListFilterIcon,
} from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/SideBarUI/sidebar";
import { FILTER_DEFINITIONS, filterPath } from "@/services/filters/registry";
import { spaceKeyOf, type SidebarView } from "@/services/sidebar/layout";
import type { IBoard } from "@/types/data";
import { cn } from "@/utils/cn";
import NavEntry from "./NavEntry";
import { Collapse } from "./Section";

interface Shortcut {
  key: string;
  to: string;
  label: string;
}

export default function MoreSection({
  more,
  boards,
  open,
  onToggle,
}: {
  more: SidebarView["more"];
  boards: IBoard[];
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SidebarGroup>
      <SidebarGroupLabel
        render={
          <button type="button" onClick={onToggle} aria-expanded={open} />
        }
      >
        <span className="truncate">{t("sidebar.more")}</span>

        <ChevronRightIcon
          className={cn(
            "transition-[rotate] duration-150",
            open && "rotate-90",
          )}
        />
      </SidebarGroupLabel>

      <Collapse open={open}>
        <SidebarMenu>
          {more.nav.map((id) => (
            <NavEntry key={id} id={id} boards={boards} />
          ))}

          {more.groups.map((group) => (
            <Shortcuts
              key={spaceKeyOf(group)}
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
              linkIcon={<KanbanIcon />}
              links={group.boards.map((board) => ({
                key: board.id,
                to: `/boards/${board.id}`,
                label: board.title || t("common.untitledBoard"),
              }))}
            />
          ))}

          {more.filters.length > 0 && (
            <Shortcuts
              label={t("sidebar.filters")}
              icon={<ListFilterIcon />}
              linkIcon={<ListFilterIcon />}
              links={more.filters.map((id) => ({
                key: id,
                to: filterPath(id),
                label: t(FILTER_DEFINITIONS[id].labelKey),
              }))}
            />
          )}
        </SidebarMenu>
      </Collapse>
    </SidebarGroup>
  );
}

function Shortcuts({
  label,
  icon,
  linkIcon,
  links,
}: {
  label: string;
  icon: ReactNode;
  linkIcon: ReactNode;
  links: Shortcut[];
}) {
  const { pathname } = useLocation();

  return (
    <SidebarMenuItem>
      <div className="text-ink-3 text-meta flex h-8 min-w-0 items-center gap-2 px-2 [&>svg]:size-4 [&>svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>

      <SidebarMenuSub>
        {links.map((link) => (
          <SidebarMenuSubItem key={link.key}>
            <SidebarMenuSubButton
              render={<NavLink to={link.to} />}
              isActive={
                pathname === link.to || pathname.startsWith(`${link.to}/`)
              }
              title={link.label}
            >
              {linkIcon}
              <span>{link.label}</span>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        ))}
      </SidebarMenuSub>
    </SidebarMenuItem>
  );
}
