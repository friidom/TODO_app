import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { HEADER_CONTROL_ACTIVE } from "@/components/board/headerControl";
import type { TimelineView } from "@/hooks/useTimelineView";
import { TIMELINE_SCALES, windowLabel } from "@/services/views/timeline";
import { cn } from "@/utils/cn";

const STEP =
  "text-ink-2 hover:text-ink hover:bg-ink/[0.06] focus-visible:ring-brand flex h-full items-center justify-center px-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent";

export default function TimelineNav({
  view,
  ticks,
  locale,
  unscheduled,
  offWindow,
}: {
  view: TimelineView;
  ticks: string[];
  locale?: string;
  unscheduled: number;
  offWindow: number;
}) {
  const period = view.scale === "weeks" ? "week" : "month";

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="border-hairline bg-surface rounded-control flex h-8 shrink-0 items-center overflow-hidden border">
        <button
          type="button"
          onClick={() => view.step(-1)}
          aria-label={`Previous ${period}`}
          className={cn(STEP, "border-hairline border-r")}
        >
          <ChevronLeftIcon className="size-4" />
        </button>

        <button
          type="button"
          onClick={view.goToday}
          // disabled, not hidden — keeps the row width stable while paging
          disabled={view.isCurrent}
          className={cn(STEP, "px-2.5 text-xs font-medium")}
        >
          Today
        </button>

        <button
          type="button"
          onClick={() => view.step(1)}
          aria-label={`Next ${period}`}
          className={cn(STEP, "border-hairline border-l")}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <h2 className="text-ink min-w-0 text-sm font-semibold tracking-tight">
        {windowLabel(ticks, view.scale, locale)}
      </h2>

      {(unscheduled > 0 || offWindow > 0) && (
        <span className="text-ink-3 text-xs">
          {[
            offWindow > 0 ? `${offWindow} outside this range` : null,
            unscheduled > 0 ? `${unscheduled} undated` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}

      <div className="border-hairline bg-surface rounded-control ml-auto flex h-8 shrink-0 items-center gap-0.5 border p-0.5">
        {TIMELINE_SCALES.map((scale) => {
          const selected = view.scale === scale;

          return (
            <button
              key={scale}
              type="button"
              onClick={() => view.setScale(scale)}
              aria-pressed={selected}
              className={cn(
                "rounded-sm px-2.5 text-xs leading-6 capitalize transition-colors duration-150 outline-none",
                "focus-visible:ring-brand focus-visible:ring-2",
                selected
                  ? HEADER_CONTROL_ACTIVE
                  : "text-ink-3 hover:text-ink hover:bg-ink/[0.06]",
              )}
            >
              {scale}
            </button>
          );
        })}
      </div>
    </div>
  );
}
