import {
  CalendarIcon,
  GaugeIcon,
  KanbanIcon,
  ListIcon,
  WaypointsIcon,
  type LucideIcon,
} from "lucide-react";

import type { BoardView } from "@/hooks/useBoardView";
import { VIEWS, VIEW_MODES, type ViewMode } from "@/services/views/registry";
import { cn } from "@/utils/cn";

const ICONS: Record<ViewMode, LucideIcon> = {
  summary: GaugeIcon,
  board: KanbanIcon,
  list: ListIcon,
  calendar: CalendarIcon,
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
 * **Calendar left this list in M19** and is now a registry entry like the other
 * three — which cost exactly the icon below and nothing else, because the row
 * is driven by `VIEW_MODES` rather than by an array kept here. That was the
 * point of building it this way.
 *
 * **Timeline is still listed and inert**, which is the whole of M17's
 * obligation to it: the shell is prepared, nothing is built. It renders at low
 * contrast and does not respond to a click — the placeholder idiom the sidebar
 * already used, and better than a tab that navigates to an empty page.
 *
 * Underline tabs with a brand accent on the active one. Pass 2 tried a
 * contained pill group; the mockup is explicit that these are underlines, and
 * it is the right call — a pill group competes with the four bordered controls
 * to its right, where an underline sits under the content it names.
 */
const SOON: { label: string; icon: LucideIcon }[] = [
  { label: "Timeline", icon: WaypointsIcon },
];

/**
 * The tab shell, worn by the live tabs and the placeholders alike.
 *
 * The two had drifted into different heights, paddings, type sizes and gaps
 * while sitting in the same row, which is the sort of thing that reads as
 * "unfinished" without anyone being able to point at what is wrong.
 *
 * `h-full min-h-12` is what brings the underline down **to** the toolbar's
 * bottom border rather than leaving it floating in the middle of the row. The
 * tabs used to be `h-9` in a centred track, so the accent under the selected
 * view had no relationship to the line beneath it.
 *
 * It stops at touching rather than overlapping: a `-mb-px` would be clipped by
 * the row's own `overflow-x-auto`, which the tab strip needs so it can scroll
 * sideways on a phone instead of squeezing the controls beside it.
 */
const TAB =
  "flex h-full min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13px] transition-colors";

export default function ViewTabs({ view }: { view: BoardView }) {
  return (
    <div
      role="tablist"
      aria-label="View"
      className="flex shrink-0 items-stretch gap-1 self-stretch overflow-x-auto"
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
              TAB,
              "focus-visible:ring-brand rounded-t-[6px] outline-none focus-visible:ring-2",
              selected
                ? "border-brand text-ink font-medium"
                : "hover:text-ink hover:border-hairline text-ink-3 border-transparent",
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
          className={cn(TAB, "text-ink-3/45 cursor-default border-transparent")}
        >
          <Icon className="size-[17px]" />
          {label}
        </span>
      ))}
    </div>
  );
}
