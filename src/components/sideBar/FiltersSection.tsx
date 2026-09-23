import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import { ChevronRightIcon, FilterIcon, ListFilterIcon } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { filterDefinitions, filterPath } from "@/services/filters/registry";
import { cn } from "@/utils/cn";

// Collapsed by default: nine entries under the boards would push them off the
// first screen, and the boards are what people come here for.
export default function FiltersSection() {
  const location = useLocation();
  const [open, setOpen] = useState(() =>
    location.pathname.startsWith("/filters/"),
  );

  return (
    <SidebarGroup className="py-1">
      <SidebarGroupLabel
        render={
          <button
            type="button"
            onClick={() => setOpen((it) => !it)}
            aria-expanded={open}
          />
        }
        className="text-ink-3 hover:text-ink group/filters flex w-full items-center gap-1"
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <FilterIcon className="size-3.5 shrink-0" />
        <span>Filters</span>
      </SidebarGroupLabel>

      {open && (
        <SidebarMenu>
          {filterDefinitions().map((definition) => {
            const to = filterPath(definition.id);
            const isActive = location.pathname === to;

            return (
              <SidebarMenuItem key={definition.id}>
                <SidebarMenuButton
                  render={<NavLink to={to} />}
                  isActive={isActive}
                  className={cn(
                    "text-meta relative h-8 pl-7",
                    isActive
                      ? "bg-brand-soft text-ink before:bg-brand font-medium before:absolute before:top-1/2 before:left-0 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-r-full"
                      : "text-ink-2",
                  )}
                >
                  <ListFilterIcon
                    className={cn(
                      "size-3.5 shrink-0",
                      isActive && "text-brand",
                    )}
                  />
                  <span className="truncate">{definition.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}
