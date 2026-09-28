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
import ToolbarButton from "./ToolbarButton";

// "Status" is offered even though it's the identity — the columns already are the statuses
export default function BoardGroup({
  view,
  className,
}: {
  view: BoardView;
  className?: string;
}) {
  const { group } = view;

  const active = group !== "none";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            label={active ? `Group — ${GROUP_LABELS[group]}` : "Group"}
            text={active ? `Group: ${GROUP_LABELS[group]}` : "Group"}
            icon={<Rows3Icon className="size-4" />}
            active={active}
            className={className}
          />
        }
      />

      <DropdownMenuContent align="start" className="w-44">
        <GroupOptions view={view} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// shared with ViewOptions, so the folded menu offers exactly these choices
export function GroupOptions({ view }: { view: BoardView }) {
  return (
    // label goes inside the radio group — Base UI's Menu.GroupLabel needs the group context
    <DropdownMenuRadioGroup
      value={view.group}
      onValueChange={(next) => view.setGroup(next as GroupKey)}
    >
      <DropdownMenuLabel>Group by</DropdownMenuLabel>
      {GROUP_KEYS.map((key) => (
        <DropdownMenuRadioItem key={key} value={key}>
          {GROUP_LABELS[key]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
