import {
  CalendarIcon,
  KanbanIcon,
  ListIcon,
  WaypointsIcon,
  type LucideIcon,
} from "lucide-react";

import type { BoardView } from "@/hooks/useBoardView";
import { VIEWS, VIEW_MODES, type ViewMode } from "@/services/views/registry";
import { cn } from "@/utils/cn";

const ICONS: Record<ViewMode, LucideIcon> = {
  board: KanbanIcon,
  list: ListIcon,
};

/**
 * The views a board can be looked at through (M17).
 *
 * **Driven by M16's registry, not by a list kept here.** `VIEW_MODES` is the
 * single definition of what a view is, so M19 and M20 appear in this row by
 * adding a registry entry and an icon — not by editing a tab array that would
 * then be a second place a view exists.
 *
 * Switching a tab changes one search param and nothing else, so the filter,
 * search, sort and grouping the user set survive the flip. That is what makes
 * Board and List one product rather than two screens, and it comes free from
 * all four living in the same URL.
 *
 * **Calendar and Timeline are listed and inert**, which is the whole of M17's
 * obligation to them: the shell is prepared, nothing is built. They render at
 * low contrast and do not respond to a click — the placeholder idiom the
 * sidebar already used, and better than a tab that navigates to an empty page.
 *
 * Underline tabs with a brand accent on the active one. Pass 2 tried a
 * contained pill group; the mockup is explicit that these are underlines, and
 * it is the right call — a pill group competes with the four bordered controls
 * to its right, where an underline sits under the content it names.
 */
const SOON: { label: string; icon: LucideIcon }[] = [
  { label: "Calendar", icon: CalendarIcon },
  { label: "Timeline", icon: WaypointsIcon },
];

export default function ViewTabs({ view }: { view: BoardView }) {
  return (
    <div
      role="tablist"
      aria-label="View"
      className="flex shrink-0 items-center gap-1 self-stretch overflow-x-auto"
    >
      {VIEW_MODES.map((mode) => {
        const Icon = ICONS[mode];
        const selected = view.mode === mode;

        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => view.setMode(mode)}
            className={cn(
              "focus-visible:ring-brand flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-2",
              selected
                ? "border-brand text-ink font-medium"
                : "hover:text-ink text-ink-3 border-transparent",
            )}
          >
            <Icon className={cn("size-[17px]", selected && "text-brand")} />
            {VIEWS[mode].label}
          </button>
        );
      })}

      {SOON.map(({ label, icon: Icon }) => (
        <span
          key={label}
          role="tab"
          aria-selected={false}
          aria-disabled
          title={`${label} — not built yet`}
          className="text-ink-3/45 -mb-px flex h-full min-h-12 shrink-0 cursor-default items-center gap-2 border-b-2 border-transparent px-1 text-sm"
        >
          <Icon className="size-[17px]" />
          {label}
        </span>
      ))}
    </div>
  );
}
