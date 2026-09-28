import type { KeyboardEvent } from "react";
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

// the underline is a pseudo-element inset by the padding, so it spans the label rather than the hit area;
// ring-inset because the tablist scrolls, and an outset ring would be clipped by it
const TAB =
  "text-meta focus-visible:ring-brand rounded-control relative flex h-10 shrink-0 items-center gap-1.5 px-2 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-150";

const STEP: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

// driven by VIEW_MODES from the registry, not a tab list kept here — a new view means one registry entry + icon
export default function ViewTabs({ view }: { view: BoardView }) {
  const sprintsEnabled = useSprintsEnabled();

  // Backlog is the sprint planning surface, so it goes with the feature.
  // useBoardView falls back to "board" for a mode it does not recognise, and
  // BoardPage refuses to render it, so a stale ?view=backlog is safe.
  const modes = VIEW_MODES.filter(
    (mode) => sprintsEnabled || mode !== "backlog",
  );

  // a stale ?view=backlog selects no tab, and the tablist still needs one Tab stop
  const tabStop = modes.includes(view.mode) ? view.mode : "board";

  // arrows move focus only; Enter or Space switches, so passing over a tab doesn't render its whole view
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = STEP[e.key];
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const index = tabs.indexOf(e.target as HTMLButtonElement);

    if (!step || index < 0) return;

    e.preventDefault();
    tabs[step(index, tabs.length)]?.focus();
  }

  // the ! is needed: global.css sets scrollbar-width on `*` unlayered, which outranks any layered utility
  return (
    <div
      role="tablist"
      aria-label="View"
      onKeyDown={handleKeyDown}
      className="-mb-px -ml-2 flex min-w-0 [scrollbar-width:none]! items-stretch gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
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
            tabIndex={mode === tabStop ? 0 : -1}
            onClick={() => view.setMode(mode)}
            className={cn(
              TAB,
              selected
                ? "text-ink after:bg-brand font-medium"
                : "text-ink-3 hover:text-ink hover:after:bg-hairline",
            )}
          >
            <Icon className={cn("size-4 shrink-0", selected && "text-brand")} />
            {VIEWS[mode].label}
          </button>
        );
      })}
    </div>
  );
}
