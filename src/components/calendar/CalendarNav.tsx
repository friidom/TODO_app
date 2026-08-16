import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import {
  HEADER_CONTROL,
  HEADER_CONTROL_ACTIVE,
} from "@/components/board/headerControl";
import type { CalendarView } from "@/hooks/useCalendarView";
import {
  CALENDAR_LAYOUTS,
  monthLabel,
  weekLabel,
} from "@/services/views/calendar";
import { cn } from "@/utils/cn";

/**
 * Where the calendar is looking, and the two ways to change it (M19).
 *
 * **A second row inside the view, not a third slot in `ViewShell`.** M17's
 * shell has an identity row, a toolbar and a content area, and M19's obligation
 * is to *fill* that contract rather than extend it — so the period navigator
 * lives at the top of the calendar's own content, where a control that means
 * nothing to Board or List cannot end up in a toolbar all four views share.
 *
 * It wears `HEADER_CONTROL` so it sits at exactly the weight Filter and Search
 * do one row above it. The label is the only thing here at reading size,
 * because it is the only thing that answers "where am I".
 */
export default function CalendarNav({
  view,
  locale,
  offscreen,
}: {
  view: CalendarView;
  locale?: string;
  /** Visible items the grid is not currently drawing. Reported, never hidden. */
  offscreen: number;
}) {
  const label =
    view.layout === "month"
      ? monthLabel(view.anchor, locale)
      : weekLabel(view.anchor, locale);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => view.step(-1)}
          aria-label={
            view.layout === "month" ? "Previous month" : "Previous week"
          }
          className={cn(HEADER_CONTROL, "w-9 justify-center px-0")}
        >
          <ChevronLeftIcon className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => view.step(1)}
          aria-label={view.layout === "month" ? "Next month" : "Next week"}
          className={cn(HEADER_CONTROL, "w-9 justify-center px-0")}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={view.goToday}
        // Disabled rather than hidden: a control that vanishes when it would do
        // nothing makes the row change width as you page, and this one sits
        // beside two arrows you are clicking repeatedly.
        disabled={view.isCurrent}
        className={HEADER_CONTROL}
      >
        Today
      </button>

      {/* `min-w-0` and no truncation: the label is short in every locale the
          product ships, and reserving nothing for it lets the segmented control
          sit immediately after rather than at a fixed offset. */}
      <h2 className="text-ink min-w-0 text-[15px] font-semibold tracking-tight">
        {label}
      </h2>

      {offscreen > 0 && (
        // The calendar's version of the board's "3 of 57". A view that draws a
        // fraction of what the filter matched has to say so, or an empty March
        // looks like an empty board.
        <span className="text-ink-3 text-xs">{offscreen} not in view</span>
      )}

      <div className="border-hairline bg-surface rounded-control ml-auto flex h-9 shrink-0 items-center gap-0.5 border p-0.5">
        {CALENDAR_LAYOUTS.map((layout) => {
          const selected = view.layout === layout;

          return (
            <button
              key={layout}
              type="button"
              onClick={() => view.setLayout(layout)}
              aria-pressed={selected}
              className={cn(
                "rounded-[6px] px-2.5 py-1 text-[13px] capitalize transition-colors duration-150 outline-none",
                "focus-visible:ring-brand focus-visible:ring-2",
                selected
                  ? HEADER_CONTROL_ACTIVE
                  : "text-ink-3 hover:text-ink hover:bg-ink/[0.06]",
              )}
            >
              {layout}
            </button>
          );
        })}
      </div>
    </div>
  );
}
