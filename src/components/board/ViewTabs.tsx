import {
  CalendarIcon,
  GaugeIcon,
  KanbanIcon,
  LayersIcon,
  ListIcon,
  WaypointsIcon,
  type LucideIcon,
} from "lucide-react";

import type { BoardView } from "@/hooks/useBoardView";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { VIEWS, VIEW_MODES, type ViewMode } from "@/services/views/registry";
import { cn } from "@/utils/cn";

const ICONS: Record<ViewMode, LucideIcon> = {
  summary: GaugeIcon,
  board: KanbanIcon,
  list: ListIcon,
  calendar: CalendarIcon,
  timeline: WaypointsIcon,
  backlog: LayersIcon,
};

// driven by VIEW_MODES from the registry, not a tab list kept here — a new view means one registry entry + icon
const TAB =
  "flex h-full min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-meta transition-colors";

export default function ViewTabs({ view }: { view: BoardView }) {
  const sprintsEnabled = useSprintsEnabled();

  // Backlog is the sprint planning surface, so it goes with the feature.
  // useBoardView falls back to "board" for a mode it does not recognise, and
  // BoardPage refuses to render it, so a stale ?view=backlog is safe.
  const modes = VIEW_MODES.filter(
    (mode) => sprintsEnabled || mode !== "backlog",
  );

  return (
    <div
      role="tablist"
      aria-label="View"
      className="flex shrink-0 items-stretch gap-1 self-stretch overflow-x-auto"
    >
      {modes.map((mode) => {
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
    </div>
  );
}
