import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";
import { ListFilterIcon } from "lucide-react";

import DropLine from "@/components/dnd/DropLine";
import { useReorderItem } from "@/components/dnd/reorderDnd";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { filterPath, type FilterDefinition } from "@/services/filters/registry";
import { SIDEBAR_DND, type SidebarList } from "@/services/sidebar/layout";
import { cn } from "@/utils/cn";
import Section, { Grip } from "./Section";
import { stepKey } from "./stepKey";

export default function FiltersSection({
  filters,
  open,
  onToggle,
  onStep,
}: {
  filters: FilterDefinition[];
  open: boolean;
  onToggle: () => void;
  onStep: (list: SidebarList, id: string, delta: -1 | 1) => void;
}) {
  const { t } = useTranslation();

  return (
    <Section
      id="filters"
      label={t("sidebar.filters")}
      open={open}
      onToggle={onToggle}
      onStep={(delta) => onStep("section", "filters", delta)}
    >
      <SidebarMenu>
        {filters.map((definition) => (
          <FilterRow
            key={definition.id}
            definition={definition}
            onStep={(delta) => onStep("filter", definition.id, delta)}
          />
        ))}
      </SidebarMenu>
    </Section>
  );
}

function FilterRow({
  definition,
  onStep,
}: {
  definition: FilterDefinition;
  onStep: (delta: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();

  const { setNodeRef, pointerProps, isDragging, edge } = useReorderItem(
    definition.id,
    { group: SIDEBAR_DND.filter, axis: "y" },
  );

  const to = filterPath(definition.id);
  const label = t(definition.labelKey);

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      className={cn("transition-opacity", isDragging && "opacity-40")}
    >
      <Grip {...pointerProps} className="-left-2" />

      <SidebarMenuButton
        render={<NavLink to={to} draggable={false} />}
        isActive={location.pathname === to}
        title={label}
        onKeyDown={stepKey(onStep)}
      >
        <ListFilterIcon />
        <span>{label}</span>
      </SidebarMenuButton>

      <DropLine edge={edge} axis="y" />
    </SidebarMenuItem>
  );
}
