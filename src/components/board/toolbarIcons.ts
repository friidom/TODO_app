import {
  ArrowUpDownIcon,
  CalendarDaysIcon,
  CircleDotIcon,
  Rows3Icon,
  SearchIcon,
  ShapesIcon,
  SignalHighIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";

import type { ToolbarControlId } from "@/services/views/toolbar";

export const TOOLBAR_ICONS: Record<ToolbarControlId, LucideIcon> = {
  search: SearchIcon,
  assignee: UserRoundIcon,
  status: CircleDotIcon,
  priority: SignalHighIcon,
  type: ShapesIcon,
  due: CalendarDaysIcon,
  group: Rows3Icon,
  sort: ArrowUpDownIcon,
};
