import { useTranslation } from "react-i18next";
import { memo } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";

import IssueKey from "@/components/todo/IssueKey";
import AssigneeControl from "@/components/todo/TodoItem/AssigneeControl";
import StatusControl from "@/components/todo/TodoItem/StatusControl";
import IconButton from "@/components/ui/IconButton";
import { categoryOf } from "@/constants/columns";
import { workTypeOf } from "@/constants/workTypes";
import type { DragTarget } from "@/hooks/useTimelineDrag";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import type { SubtaskProgress } from "@/services/todos/subtasks";
import { addDays } from "@/services/views/calendar";
import {
  placeItem,
  windowEnd,
  type Placement,
  type TimelineScale,
} from "@/services/views/timeline";
import {
  moveRange,
  type DayRange,
  type DragMode,
} from "@/services/views/timelineDrag";
import type { TimelineNode } from "@/services/views/timelineHierarchy";
import type { IStatus } from "@/types/data";
import { cn } from "@/utils/cn";
import { formatDue } from "@/utils/dueDate";
import { issueHref } from "@/utils/taskRef";
import { taskKey } from "@/utils/taskKey";
import TimelineBar, { DatePill } from "./TimelineBar";
import {
  RAIL,
  ROW_HEIGHT,
  ROW_HOVER,
  SIDE_CELL,
  WORK_CELL,
  spanStyle,
} from "./timelineAxis";

export interface RailColumns {
  status: boolean;
  assignee: boolean;
}

// Memoized on purpose — a drag re-renders the grid per column crossed, and every row outside the dragged branch gets the same props.
// Callbacks take an id or a node rather than being per-row closures, or a fresh function every render would break the memo.
const TimelineRow = memo(function TimelineRow({
  node,
  parentKey,
  draft,
  shift,
  ticks,
  scale,
  status,
  keyPrefix,
  locale,
  today,
  interactive,
  dragging,
  open,
  saving,
  progress,
  columns,
  onToggle,
  onOpenTask,
  onGrab,
  onAddChild,
  onJump,
}: {
  node: TimelineNode;
  parentKey: string | null;
  draft: DayRange | null;
  // days the branch above is being moved by, previewed on its descendants
  shift: number;
  ticks: string[];
  scale: TimelineScale;
  status?: IStatus;
  keyPrefix: string;
  locale?: string;
  today: string;
  interactive: boolean;
  dragging: boolean;
  open: boolean;
  saving: boolean;
  progress: SubtaskProgress | null;
  columns: RailColumns;
  onToggle: (id: string) => void;
  onOpenTask: (id: string) => void;
  onGrab: (event: React.PointerEvent, target: DragTarget) => void;
  onAddChild?: (node: TimelineNode) => void;
  onJump: (day: string) => void;
}) {
  const { t } = useTranslation();
  const { todo, source } = node;

  const range =
    draft ??
    (node.range && shift !== 0 ? moveRange(node.range, shift) : node.range);
  const place = range ? placeItem(range, ticks, scale) : null;

  const name = todo.title || t("common.untitled");
  const open_ = () => onOpenTask(todo.id);

  const grab = (event: React.PointerEvent, mode: DragMode) =>
    onGrab(event, {
      key: todo.id,
      node,
      mode,
      // the stored range, not the draft — otherwise a re-grab mid-drag compounds the previous offset
      base: node.range,
      limits: node.limits,
    });

  const { bounds } = node.limits;
  const boundsLabel =
    bounds.start || bounds.end
      ? `${bounds.start ? formatDue(bounds.start, today, locale) : "…"} – ${bounds.end ? formatDue(bounds.end, today, locale) : "…"}`
      : "";

  const hint =
    source === "auto"
      ? t("timeline.autoHint", { parent: parentKey ?? "" })
      : source === "derived"
        ? t("timeline.derivedHint")
        : node.outside
          ? t("timeline.outsideHint", { range: boundsLabel })
          : undefined;

  const label = range
    ? source === "point"
      ? t("timeline.barPoint", {
          name,
          date: formatDue(range.start, today, locale),
        })
      : t("timeline.barRange", {
          name,
          start: formatDue(range.start, today, locale),
          end: formatDue(range.end, today, locale),
        })
    : name;

  const lastDay = ticks.length ? addDays(windowEnd(ticks, scale), -1) : "";

  const band =
    dragging && (bounds.start || bounds.end) && ticks.length
      ? placeItem(
          { start: bounds.start ?? ticks[0], end: bounds.end ?? lastDay },
          ticks,
          scale,
        )
      : null;

  const before = node.range !== null && !place && node.range.end < ticks[0];

  return (
    <Row>
      <Rail
        node={node}
        name={name}
        keyPrefix={keyPrefix}
        status={status}
        open={open}
        progress={progress}
        columns={columns}
        interactive={interactive}
        warning={node.outside ? hint : undefined}
        onToggle={onToggle}
        onOpen={open_}
        onAddChild={onAddChild}
      />

      <div
        onPointerDown={
          interactive && !node.range
            ? (event) =>
                onGrab(event, {
                  key: todo.id,
                  node,
                  mode: "draw",
                  base: null,
                  limits: node.limits,
                })
            : undefined
        }
        className={cn(
          "relative flex-1",
          interactive && !node.range && "cursor-crosshair",
        )}
      >
        {band && (
          <span
            aria-hidden
            style={spanStyle(band.from, band.to, band.total)}
            className={cn(
              "border-brand/45 bg-brand/[0.06] absolute inset-y-0 border-dashed",
              !band.openStart && "border-l",
              !band.openEnd && "border-r",
            )}
          />
        )}

        {place && !node.range && (
          <span
            aria-hidden
            style={spanStyle(place.from, place.to, place.total)}
            className="border-brand bg-brand/25 absolute top-1/2 h-6 -translate-y-1/2 rounded-[3px] border border-dashed"
          />
        )}

        {place &&
          node.range &&
          range &&
          (source === "point" ? (
            <PointMarker
              place={place}
              range={range}
              category={status?.category}
              dueOnly={!todo.start_date}
              label={label}
              locale={locale}
              today={today}
              interactive={interactive}
              dragging={dragging}
              saving={saving}
              onOpen={open_}
              onGrab={grab}
            />
          ) : (
            <TimelineBar
              category={status?.category}
              place={place}
              range={range}
              today={today}
              label={label}
              hint={hint}
              locale={locale}
              source={source}
              outside={node.outside}
              saving={saving}
              interactive={interactive}
              dragging={dragging}
              onOpen={open_}
              onGrab={grab}
            />
          ))}

        <div className="pointer-events-none absolute inset-0 flex items-center">
          {!node.range && !draft && (
            <span
              style={{ left: "calc(var(--timeline-rail) + 0.375rem)" }}
              className="border-hairline bg-surface text-ink-3 text-mini sticky flex h-5 items-center gap-1 rounded-full border border-dashed px-2 font-medium"
            >
              <CalendarPlusIcon className="size-3" />
              {t("timeline.noDates")}
              {interactive && (
                <span className="text-ink-3/70 hidden group-hover:inline">
                  · {t("timeline.dragToPlan")}
                </span>
              )}
            </span>
          )}

          {node.range && !place && (
            <button
              type="button"
              onClick={() => onJump(node.range!.start)}
              aria-label={t("timeline.jumpTo", {
                date: formatDue(node.range.start, today, locale),
              })}
              style={
                before
                  ? { left: "calc(var(--timeline-rail) + 0.375rem)" }
                  : undefined
              }
              className={cn(
                "border-hairline bg-elevated text-ink-2 hover:text-ink hover:border-ink/25 focus-visible:ring-brand text-mini shadow-e1 pointer-events-auto sticky flex h-5 items-center gap-1 rounded-full border px-1.5 font-medium tabular-nums transition-colors outline-none focus-visible:ring-2",
                !before && "right-1.5 ml-auto",
              )}
            >
              {before && <ArrowLeftIcon className="size-3" />}
              {formatDue(
                before ? node.range.end : node.range.start,
                today,
                locale,
              )}
              {!before && <ArrowRightIcon className="size-3" />}
            </button>
          )}
        </div>
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
        "group relative flex shrink-0 border-b border-(--list-line) transition-colors duration-150",
        ROW_HEIGHT,
        ROW_HOVER,
      )}
    >
      {children}
    </div>
  );
}

function Rail({
  node,
  name,
  keyPrefix,
  status,
  open,
  progress,
  columns,
  interactive,
  warning,
  onToggle,
  onOpen,
  onAddChild,
}: {
  node: TimelineNode;
  name: string;
  keyPrefix: string;
  status?: IStatus;
  open: boolean;
  progress: SubtaskProgress | null;
  columns: RailColumns;
  interactive: boolean;
  warning?: string;
  onToggle: (id: string) => void;
  onOpen: () => void;
  onAddChild?: (node: TimelineNode) => void;
}) {
  const { t } = useTranslation();
  const { todo, depth } = node;
  const patch = useTodoPatch(todo);

  const type = workTypeOf(todo.type);
  const TypeIcon = type.icon;
  const key = taskKey(keyPrefix, todo.board_key);

  return (
    <div className={RAIL}>
      <div
        data-tl-col="work"
        className={cn(
          "relative flex min-w-0 shrink-0 items-center gap-1.5 pr-2 text-sm",
          WORK_CELL,
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            data-disclosure
            onClick={() => onToggle(todo.id)}
            aria-expanded={open}
            aria-label={t(open ? "sidebar.collapse" : "sidebar.expand", {
              name,
            })}
            className="text-ink-3 hover:text-ink hover:bg-ink/10 focus-visible:ring-brand grid size-5 shrink-0 place-items-center rounded transition-colors outline-none focus-visible:ring-2"
          >
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform duration-150",
                open && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span aria-hidden className="size-5 shrink-0" />
        )}

        <TypeIcon className={cn("size-4 shrink-0", type.tone)} />

        <IssueKey
          issueKey={key}
          href={issueHref(key ?? "", {
            boardId: todo.board_id,
            todoId: todo.id,
          })}
          onOpen={onOpen}
          done={status?.category === "done"}
        />

        <button
          type="button"
          onClick={onOpen}
          title={todo.title ?? undefined}
          className={cn(
            "text-ink focus-visible:ring-brand hover:text-brand min-w-0 flex-1 truncate rounded text-left transition-colors outline-none focus-visible:ring-2",
            depth === 0 && "font-semibold",
          )}
        >
          {todo.title || (
            <span className="text-ink-3/60">{t("common.untitled")}</span>
          )}
        </button>

        {warning && (
          <TriangleAlertIcon
            role="img"
            aria-label={warning}
            className="text-status-red size-3.5 shrink-0"
          >
            <title>{warning}</title>
          </TriangleAlertIcon>
        )}

        {onAddChild && interactive && (
          <span className="coarse:flex absolute inset-y-0 right-0 hidden items-center bg-(--list-row) pr-1.5 pl-1 group-hover:flex group-hover:bg-(--tl-hover) focus-within:flex">
            <IconButton
              size="xs"
              label={t(
                depth === 0 ? "timeline.addTask" : "timeline.addSubtask",
                { name },
              )}
              onClick={() => onAddChild(node)}
            >
              <PlusIcon />
            </IconButton>
          </span>
        )}
      </div>

      {columns.status && (
        <div data-tl-col="status" className={cn(SIDE_CELL, "w-(--tl-status)")}>
          {progress && progress.total > 0 && depth === 0 ? (
            <span
              role="img"
              aria-label={t("timeline.tasksDone", {
                done: progress.done,
                count: progress.total,
              })}
              title={t("timeline.tasksDone", {
                done: progress.done,
                count: progress.total,
              })}
              className="bg-ink/[0.12] flex h-1.5 w-full overflow-hidden rounded-full"
            >
              <span
                className="bg-status-green h-full transition-[width] duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </span>
          ) : (
            <span
              className={cn(
                "flex min-w-0",
                !interactive && "pointer-events-none",
              )}
            >
              <StatusControl
                variant="lozenge"
                todoId={todo.id}
                statusId={todo.status_id}
              />
            </span>
          )}
        </div>
      )}

      {columns.assignee && (
        <div
          data-tl-col="assignee"
          className={cn(
            SIDE_CELL,
            "w-(--tl-assignee)",
            !interactive && "pointer-events-none",
          )}
        >
          <AssigneeControl
            variant="cell"
            boardId={todo.board_id}
            value={todo.assignee_id}
            onChange={(assignee_id) => patch({ assignee_id })}
          />
        </div>
      )}
    </div>
  );
}

function PointMarker({
  place,
  range,
  category,
  dueOnly,
  label,
  locale,
  today,
  interactive,
  dragging,
  saving,
  onOpen,
  onGrab,
}: {
  place: Placement;
  range: DayRange;
  category?: string;
  dueOnly: boolean;
  label: string;
  locale?: string;
  today: string;
  interactive: boolean;
  dragging: boolean;
  saving: boolean;
  onOpen: () => void;
  onGrab: (event: React.PointerEvent, mode: DragMode) => void;
}) {
  const { t } = useTranslation();
  const date = formatDue(range.start, today, locale);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      onPointerDown={interactive ? (event) => onGrab(event, "move") : undefined}
      // the diamond's centre (px-1 plus half its width) on the middle of its day
      style={{
        left: `calc(${((place.from + 0.5) / place.total) * 100}% - 0.5625rem)`,
      }}
      className={cn(
        "focus-visible:ring-brand absolute top-1/2 flex h-6 -translate-y-1/2 items-center gap-1.5 rounded-sm px-1 outline-none focus-visible:ring-2",
        interactive && "cursor-grab",
        dragging && "cursor-grabbing",
        saving && "motion-safe:animate-pulse",
      )}
    >
      <DatePill side="start" show={dragging} text={date} />

      <span
        className={cn(
          "size-2.5 shrink-0 rotate-45 rounded-[2px] ring-1 ring-white/15 ring-inset",
          categoryOf(category).dot,
          dragging && "ring-white/50",
        )}
      />

      <span className="text-ink-2 text-mini whitespace-nowrap tabular-nums">
        {t(dueOnly ? "timeline.dueOn" : "timeline.startsOn", { date })}
      </span>
    </button>
  );
}
