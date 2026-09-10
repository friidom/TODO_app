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

export default function CalendarNav({
  view,
  locale,
  offscreen,
}: {
  view: CalendarView;
  locale?: string;
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
        // disabled, not hidden — hiding it would shift the row width while paging
        disabled={view.isCurrent}
        className={HEADER_CONTROL}
      >
        Today
      </button>

      <h2 className="text-ink min-w-0 text-sm font-semibold tracking-tight">
        {label}
      </h2>

      {offscreen > 0 && (
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
                "text-meta rounded-[6px] px-2.5 py-1 capitalize transition-colors duration-150 outline-none",
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
