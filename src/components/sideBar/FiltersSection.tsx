import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import { ListFilterIcon } from "lucide-react";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { filterDefinitions, filterPath } from "@/services/filters/registry";
import SectionLabel from "./SectionLabel";

// Collapsed by default: nine entries under the boards would push them off the
// first screen, and the boards are what people come here for.
export default function FiltersSection() {
  const location = useLocation();
  const [open, setOpen] = useState(() =>
    location.pathname.startsWith("/filters/"),
  );

  return (
    <SidebarGroup>
      <SectionLabel
        label="Filters"
        open={open}
        onToggle={() => setOpen((it) => !it)}
      />

      {open && (
        <SidebarMenu>
          {filterDefinitions().map((definition) => {
            const to = filterPath(definition.id);

            return (
              <SidebarMenuItem key={definition.id}>
                <SidebarMenuButton
                  render={<NavLink to={to} />}
                  isActive={location.pathname === to}
                >
                  <ListFilterIcon />
                  <span>{definition.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}
