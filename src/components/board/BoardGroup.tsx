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

// "Status" is offered even though it's the identity — the columns already are the statuses
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
        {/* label goes inside the radio group — Base UI's Menu.GroupLabel needs the group context */}
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
