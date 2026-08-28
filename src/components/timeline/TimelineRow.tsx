import { memo } from "react";

import { categoryOf } from "@/constants/columns";
import { PRIORITIES, toPriority } from "@/constants/priorities";
import { workTypeOf } from "@/constants/workTypes";
import {
  placeItem,
  type TimelineItem,
  type TimelineScale,
} from "@/services/views/timeline";
import type { DragTarget } from "@/hooks/useTimelineDrag";
import type { DayRange, DragMode } from "@/services/views/timelineDrag";
import type { IColumn, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { formatDayFull, formatDue } from "@/utils/dueDate";
import { taskKey } from "@/utils/taskKey";
import TimelineBar, { DatePill } from "./TimelineBar";
import { ROW_HEIGHT, trackColumns } from "./timelineAxis";

type Placement = NonNullable<ReturnType<typeof placeItem>>;

/**
 * One work item as a row: its name on the left, its range on the axis (M20).
 *
 * **Memoised, and that is load-bearing rather than housekeeping.** A drag
 * re-renders the grid once per column the pointer crosses; without this, each
 * of those renders would walk every row on the board. Every row but the dragged
 * one receives `draft: null` — the same value, so the comparison passes and the
 * render stops here. `onOpenTask` takes the id rather than being a per-row
 * closure for the same reason: a fresh function each render would fail the
 * comparison for every row and undo the memo entirely.
 *
 * **The draft is what makes the bar move live.** While a gesture is in flight
 * the row is handed a range that is not what is stored, and it re-places itself
 * from that instead — so the width and position follow the pointer without
 * anything being written, and a cancelled gesture leaves nothing to undo. The
 * placement is recomputed with the same `placeItem` the grid used, so a bar
 * dragged towards the edge of the window clips exactly as a stored one would.
 */
const TimelineRow = memo(function TimelineRow({
  item,
  place,
  draft,
  ticks,
  scale,
  column,
  keyPrefix,
  locale,
  today,
  interactive,
  dragging,
  onOpenTask,
  onGrab,
  rail,
}: {
  item: TimelineItem;
  /** Where the stored dates put it. Superseded by `draft` mid-gesture. */
  place: Placement;
  /** The range this row is being dragged to, or null when it is at rest. */
  draft: DayRange | null;
  ticks: string[];
  scale: TimelineScale;
  /** The column the item is in — its category is the bar's colour. */
  column?: IColumn;
  keyPrefix: string;
  locale?: string;
  today: string;
  interactive: boolean;
  dragging: boolean;
  onOpenTask: (id: string) => void;
  /**
   * The hook's own `begin`, handed down unwrapped so it stays referentially
   * stable across renders and the memo above keeps holding. The row builds the
   * target itself — it is the thing that knows which item this is.
   */
  onGrab: (event: React.PointerEvent, target: DragTarget) => void;
  /**
   * Replaces the default `RowRail` (M28-B) — an Epic's header (chevron,
   * progress badge) and an indented Task nested under one both need a rail
   * the plain one does not draw, and this is the one thing about either that
   * differs from an ordinary row. Everything to the right — placement, the
   * point diamond, the bar, the drag handles — is unchanged and shared,
   * because none of it has any reason to know what kind of row it is under.
   */
  rail?: React.ReactNode;
}) {
  const { todo } = item;

  const range = draft ?? { start: item.start, end: item.end };

  // Re-placed from the draft while dragging. `placeItem` returns null once a
  // range leaves the window entirely, in which case there is nothing to draw
  // and the stored placement is the honest fallback until the pointer comes
  // back.
  const shown =
    (draft &&
      placeItem(
        { ...item, start: range.start, end: range.end },
        ticks,
        scale,
      )) ||
    place;

  const label = item.isPoint
    ? `${todo.title ?? "Untitled"} — ${formatDue(range.start, today, locale)}`
    : `${todo.title ?? "Untitled"} — ${formatDue(range.start, today, locale)} to ${formatDue(range.end, today, locale)}`;

  const open = () => onOpenTask(todo.id);

  // Built here rather than by the grid: a closure per row created *outside* the
  // memo is a new prop every render, while one created inside it is free.
  const grab = (event: React.PointerEvent, mode: DragMode) =>
    onGrab(event, {
      key: todo.id,
      todo,
      mode,
      // The stored range, never the draft — a gesture that began mid-drag would
      // otherwise compound the previous one's offset.
      base: { start: item.start, end: item.end },
    });

  return (
    <Row>
      {rail ?? <RowRail todo={todo} keyPrefix={keyPrefix} onOpen={open} />}

      <div
        className="grid flex-1 items-center"
        style={{ gridTemplateColumns: trackColumns(ticks.length, scale) }}
      >
        {item.isPoint ? (
          // A diamond, not a one-column bar: the plan draws the distinction
          // between a task whose range is known and one that has a single date,
          // and the shapes have to differ or the distinction is lost.
          //
          // **It moves and it does not resize.** A point knows one date and
          // nothing about the other; dragging it says that date moved, and
          // giving it an edge to pull would mean manufacturing the missing end
          // on a gesture that never asked for one. `scheduleFields` is where
          // that rule is enforced — this is only where it is not offered.
          <button
            type="button"
            onClick={open}
            aria-label={label}
            title={label}
            onPointerDown={interactive ? (e) => grab(e, "move") : undefined}
            style={{ gridColumn: `${shown.index + 1} / span ${shown.span}` }}
            className={cn(
              "focus-visible:ring-brand relative flex items-center justify-center outline-none focus-visible:ring-2",
              // Matches the bar: `grab` at rest, `grabbing` while held.
              interactive && "cursor-grab",
              dragging && "cursor-grabbing",
            )}
          >
            {/* One pill, not two. A point knows one date; a second chip reading
                the same day back would imply a span it does not have. */}
            <DatePill
              side="end"
              show={dragging}
              text={formatDayFull(range.start, locale)}
            />

            <span
              className={cn(
                "size-2.5 rotate-45 rounded-[2px] ring-1 ring-white/15 transition-shadow duration-150 ring-inset group-hover:ring-white/35",
                categoryOf(column?.category).dot,
                dragging && "ring-white/50",
              )}
            />
          </button>
        ) : (
          <TimelineBar
            category={column?.category}
            place={shown}
            range={range}
            today={today}
            label={label}
            locale={locale}
            interactive={interactive}
            dragging={dragging}
            onOpen={open}
            onGrab={grab}
          />
        )}
      </div>
    </Row>
  );
});

export default TimelineRow;

/**
 * The row shell, worn by a placed item and an undated one alike.
 *
 * **`relative` is load-bearing.** The axis — its column rules, its weekend tint
 * and the today line — is one absolutely positioned layer behind everything, so
 * a static row would be painted *under* it. Positioned and later in the DOM
 * puts the row on top, while its background stays transparent so the grid keeps
 * showing through; only the hover tint paints, and it is translucent.
 */
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "border-hairline hover:bg-ink/[0.04] group relative flex border-b transition-colors duration-150 last:border-b-0",
        ROW_HEIGHT,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The item's name, pinned to the left edge of the scroller.
 *
 * Sticky rather than a second, synchronised scroll container: one scroller
 * means the header, the rows and the today line cannot drift apart mid-scroll.
 *
 * Shared with the undated section, which is a rail and an empty track — so an
 * item with no dates is listed in exactly the shape it would have if it had
 * them, which is the point of listing it at all.
 */
export function RowRail({
  todo,
  keyPrefix,
  onOpen,
  hint,
  indent,
}: {
  todo: Todo;
  keyPrefix: string;
  onOpen: () => void;
  /** Shown on hover in place of the priority icon — the undated rows' nudge. */
  hint?: string;
  /** Extra left padding for a Task nested under an Epic (M28-B) — the visual
   * cue for "this belongs to the group above it", contained entirely inside
   * the rail's own fixed width so it can never touch the date grid beside
   * it. */
  indent?: boolean;
}) {
  const type = workTypeOf(todo.type);
  const TypeIcon = type.icon;

  const priority = toPriority(todo.priority);
  const priorityMeta = priority ? PRIORITIES[priority] : null;
  const PriorityIcon = priorityMeta?.icon;

  const key = taskKey(keyPrefix, todo.board_key);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={todo.title ?? undefined}
      className={cn(
        "border-hairline bg-surface group-hover:bg-elevated focus-visible:ring-brand sticky left-0 z-10 flex w-(--timeline-rail) shrink-0 items-center gap-1.5 border-r px-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset",
        indent && "pl-7",
      )}
    >
      <TypeIcon className={cn("size-3.5 shrink-0", type.tone)} />

      {key && (
        <span className="text-ink-3/80 text-micro shrink-0 font-medium tabular-nums">
          {key}
        </span>
      )}

      <span className="text-ink min-w-0 flex-1 truncate text-xs">
        {todo.title || <span className="text-ink-3/60">Untitled</span>}
      </span>

      {hint ? (
        <span className="text-ink-3/70 text-micro hidden shrink-0 group-hover:inline">
          {hint}
        </span>
      ) : (
        PriorityIcon && (
          <PriorityIcon
            className={cn("size-3.5 shrink-0", priorityMeta?.tone)}
          />
        )
      )}
    </button>
  );
}
