import { KanbanIcon, ListIcon } from "lucide-react";

import type { BoardView, BoardViewMode } from "@/hooks/useBoardView";
import { cn } from "@/utils/cn";

const MODES = [
  { mode: "board", icon: KanbanIcon, label: "Board" },
  { mode: "list", icon: ListIcon, label: "List" },
] as const satisfies readonly {
  mode: BoardViewMode;
  icon: typeof KanbanIcon;
  label: string;
}[];

/**
 * Board or list, as a segmented control.
 *
 * Two renderings of one board, so this switches a view rather than navigating:
 * the filter, sort and grouping the user set survive the flip, because all four
 * live in the same URL and only `view` changes.
 *
 * The label hides below `sm` and the icons carry it — the header already wraps
 * on a narrow screen and this is the smallest thing in it that can afford to.
 */
export default function ViewSwitch({ view }: { view: BoardView }) {
  return (
    <div
      role="group"
      aria-label="View"
      className="border-hairline bg-surface rounded-control flex h-9 items-center gap-0.5 border p-0.5"
    >
      {MODES.map(({ mode, icon: Icon, label }) => {
        const selected = view.mode === mode;

        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            title={`${label} view`}
            onClick={() => view.setMode(mode)}
            className={cn(
              "focus-visible:ring-brand flex h-full items-center gap-1.5 rounded-[calc(var(--radius-control-size)-2px)] px-2 text-sm transition-colors outline-none focus-visible:ring-2",
              selected
                ? "bg-brand-soft text-brand font-medium"
                : "text-ink-3 hover:text-ink hover:bg-elevated",
            )}
          >
            <Icon className="size-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
