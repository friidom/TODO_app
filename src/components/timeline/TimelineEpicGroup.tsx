import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import type { DragTarget } from "@/hooks/useTimelineDrag";
import { workTypeOf } from "@/constants/workTypes";
import type { SubtaskProgress } from "@/services/todos/subtasks";
import type { PlacedEpicGroup } from "@/services/views/timelineHierarchy";
import type { DayRange } from "@/services/views/timelineDrag";
import type { TimelineScale } from "@/services/views/timeline";
import type { IColumn, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";
import TimelineRow, { Row, RowRail } from "./TimelineRow";

/**
 * One Epic, its Tasks, and the affordance to add another (M28-B).
 *
 * **The header row reuses `TimelineRow` for its bar, not a second bar
 * implementation.** An Epic with its own explicit dates is placed and drawn
 * exactly like a Task — `TimelineRow` does not know or care that `item.todo`
 * is an Epic, only that it has a placement. The one thing that differs is the
 * rail beside it (a chevron and a progress badge instead of a priority icon),
 * which is `TimelineRow`'s `rail` override, added for exactly this.
 *
 * **A rolled-up range is drawn, not written.** When the Epic has no dates of
 * its own, `group.isDerived` says so, and this component passes
 * `interactive={false}` for that one bar regardless of the view's own
 * permission — there is no explicit date to move without inventing one, so
 * the bar opens the Epic on click (every `TimelineBar` always does) but shows
 * no resize handles, no grab cursor, and does not drag. No second visual style
 * beyond that: the shape, colour and progress fill are the same rendering the
 * rest of the axis uses — the interaction difference alone is the signal.
 *
 * **A bare Epic — no dates anywhere, `group.place` and `group.item` both
 * null — still gets a row.** It is a container first; "nothing scheduled
 * yet" is not the same fact as "does not exist", and the header alone is
 * enough to hold its place in the list.
 *
 * **No "+ Create task" row of its own (M31-B removed it).** Every Task on
 * this Timeline still gets here the same way — `parent_id` naming this
 * Epic — but the row that let you draw one directly under a group is gone;
 * "+ Create epic" (`TimelineGrid`'s own, the Timeline's one remaining create
 * affordance) is the only sweep-to-create gesture left. Tasks are still
 * planned the ordinary way, from the Task's own detail panel or the Board.
 */
export default function TimelineEpicGroup({
  placed,
  ticks,
  scale,
  columnById,
  keyPrefix,
  locale,
  today,
  interactive,
  progress,
  collapsed,
  onToggleCollapse,
  draft,
  dragging,
  onOpenTask,
  onGrab,
}: {
  placed: PlacedEpicGroup;
  ticks: string[];
  scale: TimelineScale;
  columnById: Map<string, IColumn>;
  keyPrefix: string;
  locale?: string;
  today: string;
  interactive: boolean;
  progress: SubtaskProgress;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** The whole shared gesture draft — this group reads only the entries whose
   * key names one of its own rows, the same way `TimelineGrid` already does
   * for the top-level ones. */
  draft: { key: string; range: DayRange } | null;
  dragging: boolean;
  onOpenTask: (id: string) => void;
  onGrab: (event: React.PointerEvent, target: DragTarget) => void;
}) {
  const { group, place, tasks } = placed;
  const { epic } = group;

  const epicDraft = draft?.key === epic.id ? draft.range : null;
  const epicDragging = draft?.key === epic.id && dragging;

  const open = () => onOpenTask(epic.id);

  const rail = (
    <EpicRail
      epic={epic}
      keyPrefix={keyPrefix}
      onOpen={open}
      progress={progress}
      collapsed={collapsed}
      onToggleCollapse={group.taskCount > 0 ? onToggleCollapse : null}
    />
  );

  return (
    <>
      {place ? (
        <TimelineRow
          item={group.item!}
          place={place}
          draft={epicDraft}
          ticks={ticks}
          scale={scale}
          column={epic.column_id ? columnById.get(epic.column_id) : undefined}
          keyPrefix={keyPrefix}
          locale={locale}
          today={today}
          // A derived range is a summary, not a stored fact — nothing to
          // drag it onto without inventing dates the Epic never received.
          // See the module doc above.
          interactive={interactive && !group.isDerived}
          dragging={epicDragging}
          onOpenTask={onOpenTask}
          onGrab={onGrab}
          rail={rail}
        />
      ) : (
        <Row>
          {rail}
          <div className="flex-1" />
        </Row>
      )}

      {!collapsed &&
        tasks.map(({ item, place: taskPlace }) => {
          const active = draft?.key === item.todo.id;

          return (
            <TimelineRow
              key={item.todo.id}
              item={item}
              place={taskPlace}
              draft={active ? draft!.range : null}
              ticks={ticks}
              scale={scale}
              column={
                item.todo.column_id
                  ? columnById.get(item.todo.column_id)
                  : undefined
              }
              keyPrefix={keyPrefix}
              locale={locale}
              today={today}
              interactive={interactive}
              dragging={active && dragging}
              onOpenTask={onOpenTask}
              onGrab={onGrab}
              rail={
                <RowRail
                  todo={item.todo}
                  keyPrefix={keyPrefix}
                  onOpen={() => onOpenTask(item.todo.id)}
                  indent
                />
              }
            />
          );
        })}
    </>
  );
}

/**
 * The Epic header's own rail: a chevron in place of nothing, the ordinary
 * type icon and key, and a progress badge in place of the priority icon
 * `RowRail` shows there instead.
 *
 * A `<div>`, not a `<button>` like `RowRail` — this rail holds two separate
 * targets (the toggle, the open-task title) rather than one, the same reason
 * `EpicTasksSection`'s own header is a `<div>` around two controls instead of
 * a single clickable row.
 */
function EpicRail({
  epic,
  keyPrefix,
  onOpen,
  progress,
  collapsed,
  onToggleCollapse,
}: {
  epic: Todo;
  keyPrefix: string;
  onOpen: () => void;
  progress: SubtaskProgress;
  collapsed: boolean;
  /** Null when the Epic has no Tasks at all — nothing to expand or collapse. */
  onToggleCollapse: (() => void) | null;
}) {
  const type = workTypeOf(epic.type);
  const TypeIcon = type.icon;
  const key = taskKey(keyPrefix, epic.board_key);

  return (
    <div className="border-hairline bg-surface group-hover:bg-elevated sticky left-0 z-10 flex w-40 shrink-0 items-center gap-1 border-r py-1.5 pr-2 pl-1.5 md:w-60">
      {onToggleCollapse ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${epic.title ?? "epic"}`}
          className="text-ink-3 hover:text-ink hover:bg-ink/10 grid size-5 shrink-0 place-items-center rounded transition-colors"
        >
          {collapsed ? (
            <ChevronRightIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )}
        </button>
      ) : (
        <span aria-hidden className="size-5 shrink-0" />
      )}

      <button
        type="button"
        onClick={onOpen}
        title={epic.title ?? undefined}
        className="focus-visible:ring-brand flex min-w-0 flex-1 items-center gap-1.5 rounded text-left outline-none focus-visible:ring-2"
      >
        <TypeIcon className={cn("size-3.5 shrink-0", type.tone)} />

        {key && (
          <span className="text-ink-3/80 text-micro shrink-0 font-medium tabular-nums">
            {key}
          </span>
        )}

        <span className="text-ink min-w-0 flex-1 truncate text-xs font-semibold">
          {epic.title || <span className="text-ink-3/60">Untitled</span>}
        </span>
      </button>

      {progress.total > 0 && (
        <span
          title={`${progress.done} of ${progress.total} tasks done`}
          className="text-ink-3 text-micro shrink-0 font-medium tabular-nums"
        >
          {progress.done}/{progress.total}
        </span>
      )}
    </div>
  );
}
