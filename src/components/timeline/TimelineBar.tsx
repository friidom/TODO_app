import { useTranslation } from "react-i18next";

import {
  categoryLabelKey,
  categoryOf,
  type ColumnCategory,
} from "@/constants/columns";
import type { Placement } from "@/services/views/timeline";
import {
  progressRatio,
  rangeLength,
  type DayRange,
  type DragMode,
} from "@/services/views/timelineDrag";
import type { DateSource } from "@/services/views/timelineHierarchy";
import { cn } from "@/utils/cn";
import { formatDayFull } from "@/utils/dueDate";
import { spanStyle } from "./timelineAxis";

// no text in the bar itself — label doesn't fit a 2-day bar and repeats on a 3-month one. the drag readout names it instead.
// progress fill is derived from the status category, never stored — same rule as everywhere else: the status is the one truth for doneness.
export default function TimelineBar({
  category,
  place,
  range,
  today,
  label,
  hint,
  locale,
  source,
  outside,
  saving,
  interactive,
  dragging,
  onOpen,
  onGrab,
}: {
  category: string | null | undefined;
  place: Placement;
  range: DayRange;
  today: string;
  label: string;
  // why the bar looks the way it does, when it is not a range someone set
  hint?: string;
  locale?: string;
  source: DateSource;
  outside: boolean;
  saving: boolean;
  interactive: boolean;
  dragging: boolean;
  onOpen: () => void;
  onGrab: (event: React.PointerEvent, mode: DragMode) => void;
}) {
  const { t } = useTranslation();

  const meta = categoryOf(category);
  const ratio = progressRatio(category, range, today);
  const auto = source === "auto";

  const status = t(categoryLabelKey((category ?? "todo") as ColumnCategory), {
    defaultValue: "",
  });

  const days = rangeLength(range);

  return (
    <div
      style={spanStyle(place.from, place.to, place.total)}
      className="@container absolute top-1/2 flex h-6 min-w-1.5 -translate-y-1/2 items-stretch px-px"
    >
      {dragging && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-1 rounded-sm opacity-25",
            meta.dot,
          )}
        />
      )}

      {/* sits outside the bar, under the sticky rail (z-5 vs its z-10) so a drag to the left edge doesn't paint over the task names */}
      <DatePill
        side="start"
        show={dragging}
        text={formatDayFull(range.start, locale)}
      />

      <DatePill
        side="end"
        show={dragging}
        text={`${formatDayFull(range.end, locale)} (${t("timeline.days", { count: days })})`}
      />

      <button
        type="button"
        onClick={onOpen}
        aria-label={[label, status, hint].filter(Boolean).join(" — ")}
        title={hint ? `${label}\n${hint}` : label}
        onPointerDown={interactive ? (e) => onGrab(e, "move") : undefined}
        className={cn(
          "focus-visible:ring-brand relative flex h-full w-full min-w-0 items-center overflow-hidden transition-[opacity,box-shadow] duration-150 outline-none focus-visible:ring-2",
          auto
            ? cn("border border-dashed", meta.lozenge)
            : cn("ring-1 ring-white/10 ring-inset", meta.dot),
          source === "derived" && "timeline-derived opacity-85",
          outside &&
            "ring-status-red ring-2 ring-offset-1 ring-offset-transparent",
          saving && "motion-safe:animate-pulse",
          place.openStart ? "rounded-l-none" : "rounded-l-[3px]",
          place.openEnd ? "rounded-r-none" : "rounded-r-[3px]",
          // grab, not move — the bar only travels on one axis
          interactive && "cursor-grab",
          dragging
            ? "shadow-e3 cursor-grabbing ring-white/40"
            : !auto && "group-hover:ring-white/25",
        )}
      >
        {ratio > 0 && !auto && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1 bg-white/25"
            style={{ width: `${ratio * 100}%` }}
          />
        )}
      </button>

      {interactive && !place.openStart && (
        <Handle side="start" dragging={dragging} onGrab={onGrab} />
      )}

      {interactive && !place.openEnd && (
        <Handle side="end" dragging={dragging} onGrab={onGrab} />
      )}
    </div>
  );
}

// exported so a single-date item (one end, not two) can reuse the same readout
export function DatePill({
  side,
  text,
  show,
}: {
  side: "start" | "end";
  text: string;
  show: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        // pointer-events-none is load-bearing — the pill sits where the pointer travels during a resize
        "bg-ink text-canvas text-mini pointer-events-none absolute top-1/2 z-5 -translate-y-1/2 rounded-md px-2 py-1 leading-none font-medium whitespace-nowrap tabular-nums transition-opacity duration-150",
        side === "start" ? "right-full mr-1.5" : "left-full ml-1.5",
        show ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
    >
      {text}
    </span>
  );
}

function Handle({
  side,
  dragging,
  onGrab,
}: {
  side: DragMode & ("start" | "end");
  dragging: boolean;
  onGrab: (event: React.PointerEvent, mode: DragMode) => void;
}) {
  return (
    <span
      // not a button — no activation, only a drag; keyboard editing goes through the task detail's date controls
      role="presentation"
      onPointerDown={(event) => {
        // otherwise the press reaches the bar underneath and starts a move too
        event.stopPropagation();
        onGrab(event, side);
      }}
      className={cn(
        "coarse:w-4 absolute inset-y-0 z-10 flex w-2 cursor-ew-resize touch-none items-center justify-center transition-opacity duration-150",
        side === "start" ? "left-0" : "right-0",
        dragging
          ? "opacity-100"
          : // too short for two handles and room to grab between them: it only moves
            "coarse:opacity-100 coarse:@max-[2.5rem]:hidden opacity-0 group-hover:opacity-100 @max-[1.5rem]:hidden",
      )}
    >
      <span className="coarse:h-4 coarse:w-1 h-2.5 w-0.75 rounded-full bg-black/30 dark:bg-white/50" />
    </span>
  );
}
