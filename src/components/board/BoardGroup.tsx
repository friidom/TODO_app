import { Rows3Icon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardView } from "@/hooks/useBoardView";
import { GROUP_KEYS, GROUP_LABELS, type GroupKey } from "@/services/todos/view";
import { cn } from "@/utils/cn";
import { HEADER_CONTROL, HEADER_CONTROL_ACTIVE } from "./headerControl";

/**
 * Organise the board along a second dimension.
 *
 * `Status` is offered and is the identity: the columns already *are* the
 * statuses, so grouping by them is the board that is already on screen. It is on
 * the list because a user asking "can I group by status?" deserves to be shown
 * that they already are, not to have the option quietly missing.
 *
 * The other three render swimlanes — lanes down the page, each repeating the
 * status columns with that group's cards. The columns stay statuses, so the
 * board still reads as a board.
 */
export default function BoardGroup({ view }: { view: BoardView }) {
  const { group, setGroup } = view;

  const active = group !== "none";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={active ? `Group — ${GROUP_LABELS[group]}` : "Group"}
        className={cn(HEADER_CONTROL, active && HEADER_CONTROL_ACTIVE)}
      >
        <Rows3Icon className="size-4" />
        <span className="hidden md:inline">
          {active ? GROUP_LABELS[group] : "Group"}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        {/* Inside the radio group, not beside it — `DropdownMenuLabel` is Base
            UI's `Menu.GroupLabel` and needs the group context to name what it
            labels. Rendered first, so the panel reads exactly as before. */}
        <DropdownMenuRadioGroup
          value={group}
          onValueChange={(next) => setGroup(next as GroupKey)}
        >
          <DropdownMenuLabel>Group by</DropdownMenuLabel>
          {GROUP_KEYS.map((key) => (
            <DropdownMenuRadioItem key={key} value={key}>
              {GROUP_LABELS[key]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
