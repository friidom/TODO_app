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

// Memoized on purpose — a drag re-renders the grid per column crossed, and every row but the dragged one gets the same `draft: null`.
// onOpenTask takes an id rather than being a per-row closure, or a fresh function every render would break the memo.
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
  place: Placement;
  draft: DayRange | null;
  ticks: string[];
  scale: TimelineScale;
  column?: IColumn;
  keyPrefix: string;
  locale?: string;
  today: string;
  interactive: boolean;
  dragging: boolean;
  onOpenTask: (id: string) => void;
  onGrab: (event: React.PointerEvent, target: DragTarget) => void;
  rail?: React.ReactNode;
}) {
  const { todo } = item;

  const range = draft ?? { start: item.start, end: item.end };

  // Falls back to the stored placement once a dragged range leaves the window and placeItem returns null.
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

  const grab = (event: React.PointerEvent, mode: DragMode) =>
    onGrab(event, {
      key: todo.id,
      todo,
      mode,
      // the stored range, not the draft — otherwise a re-grab mid-drag compounds the previous offset
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
          <button
            type="button"
            onClick={open}
            aria-label={label}
            title={label}
            onPointerDown={interactive ? (e) => grab(e, "move") : undefined}
            style={{ gridColumn: `${shown.index + 1} / span ${shown.span}` }}
            className={cn(
              "focus-visible:ring-brand relative flex items-center justify-center outline-none focus-visible:ring-2",
              interactive && "cursor-grab",
              dragging && "cursor-grabbing",
            )}
          >
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

// relative is load-bearing — the axis is an absolutely positioned layer behind everything, so a static row would paint under it.
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
  hint?: string;
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
