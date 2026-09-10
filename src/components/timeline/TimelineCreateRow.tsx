import { PlusIcon } from "lucide-react";

import { placeItem, type TimelineScale } from "@/services/views/timeline";
import type { DayRange } from "@/services/views/timelineDrag";
import { cn } from "@/utils/cn";
import { formatDue } from "@/utils/dueDate";
import { Row } from "./TimelineRow";
import { ROW_HEIGHT, trackColumns } from "./timelineAxis";

// click and sweep are the same gesture — a click is just a one-column range
export default function TimelineCreateRow({
  ticks,
  scale,
  draft,
  pending,
  today,
  locale,
  interactive,
  onBegin,
  onSubmit,
  onCancel,
  label = "Create task",
  placeholder = "What needs to be done?",
  indent = false,
}: {
  ticks: string[];
  scale: TimelineScale;
  draft: DayRange | null;
  pending: DayRange | null;
  today: string;
  locale?: string;
  interactive: boolean;
  onBegin: (event: React.PointerEvent) => void;
  onSubmit: (title: string) => void;
  onCancel: () => void;
  label?: string;
  placeholder?: string;
  indent?: boolean;
}) {
  const range = pending ?? draft;
  const place = range ? placeItem(range, ticks, scale) : null;

  // uncontrolled input, keyed by the range — a new range is a new empty input, no state/effect needed to clear it
  const submit = (value: string) => {
    const trimmed = value.trim();

    if (!trimmed) return;

    onSubmit(trimmed);
  };

  return (
    <Row>
      <div
        className={cn(
          "border-hairline bg-surface group-hover:bg-elevated sticky left-0 z-10 flex w-(--timeline-rail) shrink-0 items-center gap-1.5 border-r px-3 transition-colors",
          indent && "pl-7",
        )}
      >
        {pending ? (
          <>
            <input
              key={`${pending.start}:${pending.end}`}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit(event.currentTarget.value);
                }

                if (event.key === "Escape") onCancel();
              }}
              onBlur={(event) => {
                if (!event.currentTarget.value.trim()) onCancel();
              }}
              placeholder={placeholder}
              className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-xs outline-none"
            />

            <span className="text-ink-3/70 text-micro shrink-0 tabular-nums">
              {rangeLabel(pending, today, locale)}
            </span>
          </>
        ) : (
          <button
            type="button"
            onPointerDown={interactive ? onBegin : undefined}
            disabled={!interactive}
            className="text-ink-3 hover:text-ink focus-visible:ring-brand text-mini -mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <PlusIcon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        )}
      </div>

      <div
        onPointerDown={interactive && !pending ? onBegin : undefined}
        className={cn(
          "relative grid flex-1 items-center",
          interactive && !pending && "cursor-crosshair",
          ROW_HEIGHT,
        )}
        style={{ gridTemplateColumns: trackColumns(ticks.length, scale) }}
      >
        {place && (
          <span
            aria-hidden
            style={{ gridColumn: `${place.index + 1} / span ${place.span}` }}
            className={cn(
              "border-brand bg-brand/25 mx-px flex h-5 items-center rounded-[3px] border border-dashed",
              pending && "border-solid",
            )}
          />
        )}
      </div>
    </Row>
  );
}

function rangeLabel(range: DayRange, today: string, locale?: string): string {
  const start = formatDue(range.start, today, locale);

  if (range.start === range.end) return start;

  return `${start} – ${formatDue(range.end, today, locale)}`;
}
