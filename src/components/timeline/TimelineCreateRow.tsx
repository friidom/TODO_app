import { useTranslation } from "react-i18next";
import { CornerDownLeftIcon, PlusIcon } from "lucide-react";

import { placeItem, type TimelineScale } from "@/services/views/timeline";
import type { DayRange } from "@/services/views/timelineDrag";
import { cn } from "@/utils/cn";
import { formatDue } from "@/utils/dueDate";
import { Row } from "./TimelineRow";
import { RAIL, spanStyle } from "./timelineAxis";

// Stays open after Enter, so a run of children goes in one after another; each
// lands at once with a pending key, and an empty blur or Escape closes it.
export function TimelineChildInput({
  depth,
  placeholder,
  onSubmit,
  onCancel,
}: {
  depth: number;
  placeholder: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Row>
      <div
        className={cn(RAIL, "items-center gap-1.5 pr-3")}
        style={{ paddingLeft: 8 + depth * 16 + 26 }}
      >
        <PlusIcon className="text-ink-3 size-4 shrink-0" />

        <input
          autoFocus
          aria-label={placeholder}
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();

              const title = event.currentTarget.value.trim();

              if (title) {
                onSubmit(title);
                event.currentTarget.value = "";
              }
            }

            if (event.key === "Escape") {
              event.stopPropagation();
              onCancel();
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.value.trim()) onCancel();
          }}
          className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />

        <CornerDownLeftIcon
          aria-label={t("timeline.enterToCreate")}
          className="text-ink-3/70 size-3 shrink-0"
        />
      </div>

      <div className="flex-1" />
    </Row>
  );
}

// on the track a click is a one-column sweep; the button makes an undated epic
export default function TimelineCreateRow({
  ticks,
  scale,
  draft,
  pending,
  today,
  locale,
  interactive,
  onBegin,
  onStart,
  onSubmit,
  onCancel,
  label,
  placeholder,
}: {
  ticks: string[];
  scale: TimelineScale;
  draft: DayRange | null;
  pending: { range: DayRange | null } | null;
  today: string;
  locale?: string;
  interactive: boolean;
  onBegin: (event: React.PointerEvent) => void;
  onStart: () => void;
  onSubmit: (title: string) => void;
  onCancel: () => void;
  label: string;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const range = pending ? pending.range : draft;
  const place = range ? placeItem(range, ticks, scale) : null;

  // uncontrolled input, keyed by the range — a new range is a new empty input, no state/effect needed to clear it
  const submit = (value: string) => {
    const trimmed = value.trim();

    if (!trimmed) return;

    onSubmit(trimmed);
  };

  return (
    <Row>
      <div className={cn(RAIL, "items-center gap-1.5 px-3")}>
        {pending ? (
          <>
            <input
              key={
                pending.range
                  ? `${pending.range.start}:${pending.range.end}`
                  : "undated"
              }
              autoFocus
              aria-label={placeholder}
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
              className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />

            <span className="text-ink-3 text-mini shrink-0 tabular-nums">
              {pending.range
                ? rangeLabel(pending.range, today, locale)
                : t("timeline.noDates")}
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={!interactive}
            className="text-ink-2 hover:text-ink focus-visible:ring-brand -mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <PlusIcon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        )}
      </div>

      <div
        onPointerDown={interactive && !pending ? onBegin : undefined}
        className={cn(
          "relative flex-1",
          interactive && !pending && "cursor-crosshair",
        )}
      >
        {place && (
          <span
            aria-hidden
            style={spanStyle(place.from, place.to, place.total)}
            className={cn(
              "border-brand bg-brand/25 absolute top-1/2 h-6 -translate-y-1/2 rounded-[3px] border border-dashed",
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
