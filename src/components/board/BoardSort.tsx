import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardView } from "@/hooks/useBoardView";
import {
  SORT_KEYS,
  SORT_LABELS,
  type SortDir,
  type SortKey,
} from "@/services/todos/view";
import ToolbarButton from "./ToolbarButton";

// View-only, writes nothing — sortTodos under "manual" is the identity function, so switching away and back never loses the drag order.
export default function BoardSort({
  view,
  className,
}: {
  view: BoardView;
  className?: string;
}) {
  const { sort, dir } = view;

  const active = sort !== "manual";
  const DirIcon = dir === "desc" ? ArrowDownIcon : ArrowUpIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            label={
              active
                ? `Sort — ${SORT_LABELS[sort]}, ${dir === "desc" ? "descending" : "ascending"}`
                : "Sort"
            }
            text={active ? `Sort: ${SORT_LABELS[sort]}` : "Sort"}
            icon={<ArrowUpDownIcon className="size-4" />}
            active={active}
            className={className}
          />
        }
      >
        {active && <DirIcon className="size-3.5" />}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-48">
        <SortOptions view={view} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// shared with ViewOptions, so the folded menu offers exactly these choices
export function SortOptions({ view }: { view: BoardView }) {
  const { sort, dir, setSort, setDir } = view;

  const active = sort !== "manual";

  return (
    <>
      {/* label goes inside the radio group — it reads group context that only RadioGroup provides */}
      <DropdownMenuRadioGroup
        value={sort}
        onValueChange={(next) => setSort(next as SortKey)}
      >
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        {SORT_KEYS.map((key) => (
          <DropdownMenuRadioItem key={key} value={key}>
            {SORT_LABELS[key]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>

      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup
        value={dir}
        onValueChange={(next) => setDir(next as SortDir)}
      >
        <DropdownMenuLabel>Direction</DropdownMenuLabel>
        <DropdownMenuRadioItem value="asc" disabled={!active}>
          <ArrowUpIcon className="size-4 shrink-0" />
          Ascending
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="desc" disabled={!active}>
          <ArrowDownIcon className="size-4 shrink-0" />
          Descending
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}
