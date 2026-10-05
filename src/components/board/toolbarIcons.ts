import {
  ArrowUpDownIcon,
  ListFilterIcon,
  Rows3Icon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react";

import type { ToolbarControlId } from "@/services/views/toolbar";

export const TOOLBAR_ICONS: Record<ToolbarControlId, LucideIcon> = {
  search: SearchIcon,
  filter: ListFilterIcon,
  group: Rows3Icon,
  sort: ArrowUpDownIcon,
};
