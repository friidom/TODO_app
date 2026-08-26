import { useTranslation } from "react-i18next";

import {
  categoryLabelKey,
  categoryOf,
  type ColumnCategory,
} from "@/constants/columns";
import type { placeItem } from "@/services/views/timeline";
import {
  progressRatio,
  rangeLength,
  type DayRange,
  type DragMode,
} from "@/services/views/timelineDrag";
import { cn } from "@/utils/cn";
import { formatDayFull } from "@/utils/dueDate";

type Placement = NonNullable<ReturnType<typeof placeItem>>;

/**
 * A work item's range, as the thing you plan with (M20-B).
 *
 * **The bar carries no text**, which is M20's original rule kept: the rail
 * already names the item, and a label inside a bar is legible only while the
 * bar is wide — a two-day task would show an empty capsule and a three-month
 * one would repeat what is six inches to its left. Identifying what you have
 * hold of is the drag readout's job instead, and it says more than a title
 * would: both dates and the duration, in a chip that is the same size whatever
 * the bar is.
 *
 * **Colour is still `categoryOf(...).dot`** — the board's own status palette,
 * the same green a Done column is in the Summary donut. No colour is invented
 * for this view (M17's token-continuity rule), so there is no legend to learn.
 *
 * **The progress fill is derived, never stored.** See `progressRatio`: doneness
 * on this board is which column a card is in and has no second source of truth,
 * so `done` fills, `todo` does not, and `in_progress` shows how far through its
 * own planned window it is. That is a claim about the calendar, which is true,
 * rather than a claim about the work, which nothing in the schema knows.
 *
 * **A square end still means "continues past this edge"** — and it is also
 * where the resize handle is withheld, because an end you cannot see is an end
 * you cannot meaningfully aim at.
 */
export default function TimelineBar({
  category,
  place,
  range,
  today,
  label,
  locale,
  interactive,
  dragging,
  onOpen,
  onGrab,
}: {
  category: string | null | undefined;
  place: Placement;
  range: DayRange;
  today: string;
  /** The accessible description — the rail's name plus the dates. */
  label: string;
  locale?: string;
  /** False for a viewer: the bar still opens the task, it just does not move. */
  interactive: boolean;
  dragging: boolean;
  onOpen: () => void;
  onGrab: (event: React.PointerEvent, mode: DragMode) => void;
}) {
  const { t } = useTranslation();

  const tone = categoryOf(category).dot;
  const ratio = progressRatio(category, range, today);

  const status = t(
    categoryLabelKey((category ?? "todo") as ColumnCategory),
    // The category is a checked text column, so an unknown value means a row
    // older than the constraint. `categoryOf` falls back to `todo` and so does
    // this, rather than rendering a raw key.
    { defaultValue: "" },
  );

  const days = rangeLength(range);

  return (
    <div
      style={{ gridColumn: `${place.index + 1} / span ${place.span}` }}
      className="relative flex h-5 items-stretch px-px"
    >
      {/* THE HALO. A tone-matched glow behind the bar while it is being
          dragged, so the thing under the pointer is unmistakable in a dense
          grid. A sibling at low opacity rather than a `ring`: the ring colour
          would have to be a fourth palette entry per category, whereas the fill
          class is one the board already owns. */}
      {dragging && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-1 rounded-sm opacity-25",
            tone,
          )}
        />
      )}

      {/* THE DATE READOUT. Jira's, and it is the part that makes a drag
          *accurate* rather than merely smooth: the bar shows you roughly when,
          the pills tell you exactly when, and the day count answers the
          question a Gantt is actually asked — "how long is this?" — without
          counting columns.

          Outside the bar's ends rather than inside it, because a two-day bar
          has no room for a date and this is precisely when a short bar is being
          dragged. They sit *under* the sticky rail (`z-5` against its `z-10`)
          so a bar dragged to the left edge slides its label away rather than
          painting it over the task names. */}
      <DatePill
        side="start"
        show={dragging}
        text={formatDayFull(range.start, locale)}
      />

      <DatePill
        side="end"
        show={dragging}
        text={`${formatDayFull(range.end, locale)} (${days} ${days === 1 ? "day" : "days"})`}
      />

      <button
        type="button"
        onClick={onOpen}
        aria-label={status ? `${label} — ${status}` : label}
        title={label}
        onPointerDown={interactive ? (e) => onGrab(e, "move") : undefined}
        className={cn(
          "focus-visible:ring-brand relative flex h-5 w-full min-w-0 items-center overflow-hidden ring-1 ring-white/10 transition-[opacity,box-shadow] duration-150 outline-none ring-inset focus-visible:ring-2",
          tone,
          place.openStart ? "rounded-l-none" : "rounded-l-[3px]",
          place.openEnd ? "rounded-r-none" : "rounded-r-[3px]",
          // `grab` rather than `move`: the bar travels on one axis, and `move`
          // promises four directions the timeline does not have. It said
          // `pointer` — which is not a state `grabbing` below can be the
          // pressed half of, and which described opening the task rather than
          // the gesture this view exists for.
          interactive && "cursor-grab",
          dragging
            ? "cursor-grabbing shadow-[0_8px_20px_-8px_rgb(0_0_0/0.6)] ring-white/40"
            : "group-hover:ring-white/25",
        )}
      >
        {/* THE PROGRESS FILL. A band across the lower third rather than a
            second bar or a full-height overlay: full height would restate the
            colour already there and read as two tasks abutting, while a band
            under the label is legible at 16px and stays quiet. White at a
            quarter works on all three tones in both themes without introducing
            a fourth colour. */}
        {ratio > 0 && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1 bg-white/25"
            style={{ width: `${ratio * 100}%` }}
          />
        )}
      </button>

      {/* THE HANDLES. Absolutely positioned over the bar's ends rather than
          laid out beside them, so grabbing one cannot change the bar's width by
          existing. 8px wide against a 3px visual affordance — the hit area is
          deliberately larger than what it draws, which is most of what makes a
          Gantt feel accurate rather than fiddly.

          Invisible at rest and revealed on the row's hover, so an idle timeline
          shows bars rather than bars-with-grips. */}
      {interactive && !place.openStart && (
        <Handle side="start" dragging={dragging} onGrab={onGrab} />
      )}

      {interactive && !place.openEnd && (
        <Handle side="end" dragging={dragging} onGrab={onGrab} />
      )}
    </div>
  );
}

/**
 * One end's date, on a dark chip beside the bar.
 *
 * Exported because a point — a task with a single date — wants the same readout
 * while it is dragged, and it has one end rather than two.
 */
export function DatePill({
  side,
  text,
  show,
}: {
  side: "start" | "end";
  text: string;
  /** Forced on during a drag; otherwise it waits for the row's hover. */
  show: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        // `pointer-events-none` is load-bearing, not tidiness: the pill sits
        // directly where the pointer travels during a resize, and a chip that
        // could swallow a pointer event would end the gesture it is describing.
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
      // Not a button: it has no activation, only a drag, and a button here
      // would put two tab stops on every bar that do nothing when pressed. The
      // keyboard path to a date is the task detail's date controls, which is
      // where it has always been.
      role="presentation"
      onPointerDown={(event) => {
        // Or the press reaches the bar underneath and starts a move as well.
        event.stopPropagation();
        onGrab(event, side);
      }}
      className={cn(
        "coarse:w-4 absolute inset-y-0 z-10 flex w-2 cursor-ew-resize touch-none items-center justify-center transition-opacity duration-150",
        side === "start" ? "left-0" : "right-0",
        dragging
          ? "opacity-100"
          : "coarse:opacity-100 opacity-0 group-hover:opacity-100",
      )}
    >
      {/* Darkened fill rather than a white line: on a pale Done bar a white
          grip disappears, while a shade of the bar's own colour reads on all
          three tones. */}
      <span className="coarse:h-4 coarse:w-1 h-2.5 w-0.75 rounded-full bg-black/30" />
    </span>
  );
}
