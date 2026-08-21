import { PlusIcon } from "lucide-react";

import { placeItem, type TimelineScale } from "@/services/views/timeline";
import type { DayRange } from "@/services/views/timelineDrag";
import { cn } from "@/utils/cn";
import { formatDue } from "@/utils/dueDate";
import { Row } from "./TimelineRow";
import { ROW_HEIGHT, trackColumns } from "./timelineAxis";

/**
 * Planning something that does not exist yet (M20-B).
 *
 * **A row of its own at the foot of the axis**, which is where the Jira
 * timeline in the brief puts its create affordance and is the only unambiguous
 * place for it: sweeping across an *existing* item's row would be a gesture
 * whose meaning depends on whether it happened to miss that item's bar.
 *
 * **Press-and-sweep and click are the same gesture, not two.** `draftRange`
 * returns one column when the anchor and the pointer are on the same one, so a
 * click is a one-column range and a sweep is a longer one, with no branch
 * anywhere and no separate "click to create" path to keep in step.
 *
 * **The title input lives in the rail, not floating over the range.** A form
 * anchored to the drawn columns would be a 28px-wide box at the `weeks` scale
 * and would hang off the right edge of the window for anything planned late in
 * the period. The rail is a fixed 15rem, is already sticky, and is where the
 * reference puts it — so the range stays legible as a ghost bar on the track
 * while you type its name beside it.
 *
 * It collects a title and nothing else. Status is which column a card is in and
 * this form is not inside one, so the task lands in the board's first column;
 * everything else is the task detail's job, which is where the create card in a
 * column leaves it too.
 */
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
}: {
  ticks: string[];
  scale: TimelineScale;
  /** The sweep in progress. */
  draft: DayRange | null;
  /** The range that has been swept and is waiting for a title. */
  pending: DayRange | null;
  today: string;
  locale?: string;
  interactive: boolean;
  onBegin: (event: React.PointerEvent) => void;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const range = pending ?? draft;

  // `placeItem` rather than the tick indices directly, so a ghost clips at the
  // window edge exactly as a real bar does — one rule for where a range sits.
  const place = range ? placeItem(range, ticks, scale) : null;

  /**
   * The input is **uncontrolled**, and keyed by the range it was opened on.
   *
   * A controlled value would need a piece of state and an effect to clear it
   * between one create and the next — a `setState` inside an effect, which is a
   * cascading render for a job the key already does: a new range is a new
   * input, empty, with `autoFocus` landing the caret in it. Nothing reads the
   * draft except the submit, and the submit has the element in hand.
   */
  const submit = (value: string) => {
    const trimmed = value.trim();

    if (!trimmed) return;

    onSubmit(trimmed);
  };

  return (
    <Row>
      <div className="border-hairline bg-surface group-hover:bg-elevated sticky left-0 z-10 flex w-60 shrink-0 items-center gap-1.5 border-r px-3 transition-colors">
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
              // Losing focus without a title is an abandoned gesture, not a
              // draft worth keeping open across the rest of the board.
              onBlur={(event) => {
                if (!event.currentTarget.value.trim()) onCancel();
              }}
              placeholder="What needs to be done?"
              className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
            />

            <span className="text-ink-3/70 shrink-0 text-[10px] tabular-nums">
              {rangeLabel(pending, today, locale)}
            </span>
          </>
        ) : (
          <button
            type="button"
            // Focuses nothing on its own: there is no range yet, so it explains
            // the gesture rather than replacing it with a second entry point
            // that would have to invent a default period.
            onPointerDown={interactive ? onBegin : undefined}
            disabled={!interactive}
            className="text-ink-3 hover:text-ink focus-visible:ring-brand -mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <PlusIcon className="size-3.5 shrink-0" />
            <span className="truncate">Create task</span>
          </button>
        )}
      </div>

      {/* THE DRAW SURFACE. The whole track, so there is no target to miss —
          "drag anywhere on the empty row" is the brief's wording and this is
          it literally. */}
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
              "border-brand bg-brand/25 mx-px flex h-4 items-center rounded-[3px] border border-dashed",
              // Solid once it is committed and waiting for a name: dashed says
              // "still being drawn", and it is no longer being drawn.
              pending && "border-solid",
            )}
          />
        )}
      </div>
    </Row>
  );
}

/** `24 Aug – 28 Aug`, or one day when that is all it is. */
function rangeLabel(range: DayRange, today: string, locale?: string): string {
  const start = formatDue(range.start, today, locale);

  if (range.start === range.end) return start;

  return `${start} – ${formatDue(range.end, today, locale)}`;
}
