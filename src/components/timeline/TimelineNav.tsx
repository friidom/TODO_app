import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { HEADER_CONTROL_ACTIVE } from "@/components/board/headerControl";
import type { TimelineView } from "@/hooks/useTimelineView";
import { TIMELINE_SCALES, windowLabel } from "@/services/views/timeline";
import { cn } from "@/utils/cn";

/**
 * Where the timeline is looking, and the two ways to change it (M20).
 *
 * **The same row the calendar's navigator is**, down to the control shell: a
 * second row inside the view's own content, never a third slot in `ViewShell`.
 * M17's contract is identity / toolbar / content / drawer, and M19 and M20 fill
 * it rather than extend it — a period navigator means nothing to Board, List or
 * Summary, so it cannot live in a toolbar all five views share.
 *
 * Wearing `HEADER_CONTROL` is what keeps it at exactly the weight Filter and
 * Search sit at one row above.
 */
/** One segment of the period cluster. Shared so the three cannot drift. */
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
  /** Items with no date at all. Off the timeline by the plan's rule. */
  unscheduled: number;
  /** Items that are dated, but not inside the window on screen. */
  offWindow: number;
}) {
  const period = view.scale === "weeks" ? "week" : "month";

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* One cluster rather than three boxes. Prev, Today and Next are a single
          control — you use them in sequence, on the same target — and three
          separately bordered objects for one job is most of what made the row
          look unfinished. Divided by hairlines, `h-8` rather than the toolbar's
          `h-9`, because this row sits *inside* the view and should not compete
          with the one above it. */}
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
          // Disabled rather than hidden: a control that vanishes when it would
          // do nothing makes the row change width as you page, and it sits
          // between two arrows you are clicking repeatedly.
          disabled={view.isCurrent}
          className={cn(STEP, "px-2.5 text-[12px] font-medium")}
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

      <h2 className="text-ink min-w-0 text-[14px] font-semibold tracking-tight">
        {windowLabel(ticks, view.scale, locale)}
      </h2>

      {/* The timeline's version of the board's "3 of 57", and it has two
          numbers rather than one because it drops work for two different
          reasons. Both are reported; neither is hidden. */}
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
                "rounded-[5px] px-2.5 text-[12px] leading-6 capitalize transition-colors duration-150 outline-none",
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
