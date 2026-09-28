import {
  ArrowUpDownIcon,
  Rows3Icon,
  SlidersHorizontalIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardView } from "@/hooks/useBoardView";
import { GROUP_LABELS, SORT_LABELS } from "@/services/todos/view";
import { capabilitiesOf } from "@/services/views/registry";
import { GroupOptions } from "./BoardGroup";
import { SortOptions } from "./BoardSort";
import ToolbarButton from "./ToolbarButton";

// Group and Sort folded into one trigger for a narrow toolbar — same view.setGroup/setSort/setDir, nothing held here
export default function ViewOptions({
  view,
  className,
}: {
  view: BoardView;
  className?: string;
}) {
  const { canGroup, canSort } = capabilitiesOf(view.mode);

  const grouped = canGroup && view.group !== "none";
  const sorted = canSort && view.sort !== "manual";

  const state = [
    grouped && `grouped by ${GROUP_LABELS[view.group].toLowerCase()}`,
    sorted && `sorted by ${SORT_LABELS[view.sort].toLowerCase()}`,
  ].filter(Boolean);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            label={
              state.length
                ? `View options — ${state.join(", ")}`
                : "View options"
            }
            text="View options"
            collapse="hidden @4xl:inline"
            icon={<SlidersHorizontalIcon className="size-4" />}
            active={grouped || sorted}
            className={className}
          />
        }
      />

      <DropdownMenuContent align="start" className="w-56">
        {canGroup && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Rows3Icon />
              <span className="flex-1">Group</span>
              <span className="text-ink-3">{GROUP_LABELS[view.group]}</span>
            </DropdownMenuSubTrigger>

            <DropdownMenuSubContent className="w-44">
              <GroupOptions view={view} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {canSort && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowUpDownIcon />
              <span className="flex-1">Sort</span>
              <span className="text-ink-3">{SORT_LABELS[view.sort]}</span>
            </DropdownMenuSubTrigger>

            <DropdownMenuSubContent className="w-48">
              <SortOptions view={view} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
