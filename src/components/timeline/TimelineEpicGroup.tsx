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

// reuses TimelineRow for the epic's own bar — it doesn't care that item.todo is an epic, just that it has a placement.
// a derived (rolled-up) range is drawn but not draggable, same for a sprint-bound task's range — neither is a real value to write back.
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
        tasks.map(({ item, place: taskPlace, sprintBound }) => {
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
              interactive={interactive && !sprintBound}
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

// a div, not a button like RowRail — this holds two separate click targets (toggle, open task)
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
