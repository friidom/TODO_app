import { useTranslation } from "react-i18next";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowLeftRightIcon,
  CalendarRangeIcon,
  ChevronRightIcon,
  EyeOffIcon,
  RotateCcwIcon,
} from "lucide-react";

import EmptyState from "@/components/ui/EmptyState";
import ResizeHandle from "@/components/ui/ResizeHandle";
import TableColumnMenu from "@/components/views/TableColumnMenu";
import { FRAME } from "@/components/views/listTable";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import {
  CREATE_EPIC_KEY,
  useTimelineDrag,
  type DragTarget,
} from "@/hooks/useTimelineDrag";
import type { SubtaskProgress } from "@/services/todos/subtasks";
import {
  TIMELINE_WINDOW,
  bandLabel,
  dayFraction,
  dayIndex,
  headerBands,
  windowDays,
  type TimelineScale,
} from "@/services/views/timeline";
import {
  MAX_TIMELINE_COLUMN_WIDTH,
  TIMELINE_COLUMNS,
  isTimelineColumnShown,
  railVariables,
  timelineColumnWidth,
  withTimelineColumnShown,
  withTimelineColumnWidth,
  type TimelineColumnId,
  type TimelineColumnPrefs,
} from "@/services/views/timelineColumns";
import type { DayRange } from "@/services/views/timelineDrag";
import {
  branchIds,
  flattenTimeline,
  type PlacedSprint,
  type TimelineNode,
} from "@/services/views/timelineHierarchy";
import type { StatusIndex } from "@/services/workflow/statuses";
import { cn } from "@/utils/cn";
import {
  fitWidth,
  naturalWidths,
  sample,
  trackGripReach,
} from "@/utils/fitColumn";
import { taskKey } from "@/utils/taskKey";
import TimelineCreateRow, { TimelineChildInput } from "./TimelineCreateRow";
import TimelineRow from "./TimelineRow";
import TimelineSprintBand from "./TimelineSprintBand";
import {
  HEADER_HEIGHT,
  RAIL,
  RAIL_WIDTH,
  SIDE_CELL,
  TICK_MIN_PX,
  WORK_CELL,
  spanStyle,
  trackMinWidth,
} from "./timelineAxis";

const NO_IDS: ReadonlySet<string> = new Set();

// One scroll container — the rail sticks left, the header sticks top, and both scroll with the same content so they can't drift apart.
// The axis is one absolutely-positioned layer behind every row, and it's also what the drag gestures measure against (trackRef),
// so pixel-to-day math can never disagree with where the bars actually render.
export default function TimelineGrid({
  epics,
  sprints,
  expanded,
  onToggle,
  onExpand,
  onToggleAll,
  allExpanded,
  ticks,
  scale,
  statusById,
  keyPrefix,
  locale,
  today,
  interactive,
  progress,
  saving,
  columns,
  onColumns,
  onOpenTask,
  onOpenSprint,
  onSchedule,
  onCreateEpic,
  onCreateChild,
  onJump,
  empty,
}: {
  epics: TimelineNode[];
  sprints: PlacedSprint[];
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
  onToggleAll: (() => void) | null;
  allExpanded: boolean;
  ticks: string[];
  scale: TimelineScale;
  statusById: StatusIndex;
  keyPrefix: string;
  locale?: string;
  today: string;
  interactive: boolean;
  progress: Map<string, SubtaskProgress>;
  saving: ReadonlySet<string>;
  columns: TimelineColumnPrefs;
  onColumns: (
    change: (prefs: TimelineColumnPrefs) => TimelineColumnPrefs,
  ) => void;
  onOpenTask: (id: string) => void;
  onOpenSprint: (sprintId: string) => void;
  onSchedule: (target: DragTarget, range: DayRange) => Promise<unknown>;
  onCreateEpic: (title: string, range: DayRange | null) => void;
  onCreateChild: (parent: TimelineNode, title: string) => void;
  onJump: (day: string) => void;
  empty: { title: string; hint: string } | null;
}) {
  const { t } = useTranslation();
  const sprintsEnabled = useSprintsEnabled();

  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const columnLabels: Record<TimelineColumnId, string> = {
    work: t("fields.work"),
    status: t("fields.status"),
    assignee: t("fields.assignee"),
  };

  useEffect(() => {
    const content = contentRef.current;

    return content ? trackGripReach(content, () => HEADER_HEIGHT) : undefined;
  }, []);

  const [pending, setPending] = useState<{
    key: string;
    range: DayRange | null;
  } | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const { trackRef, draft, dragging, begin, consumeClick } = useTimelineDrag({
    ticks,
    scale,
    enabled: interactive,
    onSchedule,
    onDraw: (key, range) => setPending({ key, range }),
  });

  // Stable identity so TimelineRow's memo holds — a fresh closure per render would put every row back in the drag's render path.
  const open = useCallback(
    (id: string) => {
      if (consumeClick()) return;

      onOpenTask(id);
    },
    [consumeClick, onOpenTask],
  );

  const startAdding = useCallback(
    (node: TimelineNode) => {
      setAddingTo(node.todo.id);
      onExpand(node.todo.id);
    },
    [onExpand],
  );

  const rows = useMemo(
    () => flattenTimeline(epics, (node) => expanded.has(node.todo.id)),
    [epics, expanded],
  );

  const parentKeyOf = useMemo(() => {
    const keys = new Map<string, string>();

    const visit = (nodes: TimelineNode[], parent: TimelineNode | null) => {
      for (const node of nodes) {
        if (parent) {
          keys.set(
            node.todo.id,
            taskKey(keyPrefix, parent.todo.board_key) ??
              parent.todo.title ??
              "",
          );
        }

        visit(node.children, node);
      }
    };

    visit(epics, null);

    return keys;
  }, [epics, keyPrefix]);

  const dragged = draft
    ? (rows.find((node) => node.todo.id === draft.key) ?? null)
    : null;
  const moving = draft !== null && draft.delta !== 0;

  const branch = useMemo(
    () => (dragged && moving ? branchIds(dragged) : NO_IDS),
    [dragged, moving],
  );

  const railColumns = useMemo(
    () => ({
      status: isTimelineColumnShown(columns, "status"),
      assignee: isTimelineColumnShown(columns, "assignee"),
    }),
    [columns],
  );

  const bands = useMemo(() => headerBands(ticks, scale), [ticks, scale]);
  const total = windowDays(ticks, scale);
  const pxPerDay = TICK_MIN_PX[scale] / TIMELINE_WINDOW[scale].span;
  const todayIndex = dayIndex(today, ticks, scale);
  const fraction = dayFraction(today, ticks, scale);
  const todayLabel = t("timeline.todayIs", {
    date: new Date(`${today}T00:00:00Z`).toLocaleDateString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  });

  const currentBand = bands.major.find(
    (band) =>
      todayIndex !== null && todayIndex >= band.from && todayIndex < band.to,
  );

  const gridLines = useMemo(() => {
    const months = new Set(
      (scale === "quarters" ? bands.minor : bands.major)
        .map((band) => band.from)
        .filter((from) => from > 0),
    );
    const { span } = TIMELINE_WINDOW[scale];
    const lines = [...months].map((at) => ({ at, strong: true }));

    for (let i = 1; i < ticks.length; i += 1) {
      if (!months.has(i * span)) lines.push({ at: i * span, strong: false });
    }

    return lines;
  }, [bands, ticks.length, scale]);

  const rendered: ReactNode[] = [];
  const addingIndex = addingTo
    ? rows.findIndex((node) => node.todo.id === addingTo)
    : -1;
  let insertAfter = addingIndex;

  while (
    addingIndex >= 0 &&
    insertAfter + 1 < rows.length &&
    rows[insertAfter + 1].depth > rows[addingIndex].depth
  ) {
    insertAfter += 1;
  }

  rows.forEach((node, index) => {
    const id = node.todo.id;

    rendered.push(
      <TimelineRow
        key={id}
        node={node}
        parentKey={parentKeyOf.get(id) ?? null}
        draft={draft?.key === id ? draft.range : null}
        shift={branch.has(id) ? draft!.delta : 0}
        ticks={ticks}
        scale={scale}
        status={
          node.todo.status_id ? statusById.get(node.todo.status_id) : undefined
        }
        keyPrefix={keyPrefix}
        locale={locale}
        today={today}
        interactive={interactive}
        dragging={dragging && draft?.key === id}
        open={expanded.has(id)}
        saving={saving.has(id)}
        progress={node.depth === 0 ? (progress.get(id) ?? null) : null}
        columns={railColumns}
        onToggle={onToggle}
        onOpenTask={open}
        onGrab={begin}
        onAddChild={node.depth < 2 ? startAdding : undefined}
        onJump={onJump}
      />,
    );

    if (index === insertAfter) {
      const parent = rows[addingIndex];

      rendered.push(
        <TimelineChildInput
          key={`adding:${parent.todo.id}`}
          depth={parent.depth + 1}
          placeholder={t(
            parent.depth === 0 ? "timeline.taskName" : "timeline.subtaskName",
          )}
          onSubmit={(title) => onCreateChild(parent, title)}
          onCancel={() => setAddingTo(null)}
        />,
      );
    }
  });

  return (
    <div
      ref={rootRef}
      style={railVariables(columns) as CSSProperties}
      className={cn(
        FRAME,
        "timeline-root mb-4 flex min-h-0 flex-1 flex-col overflow-hidden [--tl-hover:color-mix(in_srgb,var(--list-row),var(--ink)_5%)]",
      )}
    >
      <div data-timeline-scroll className="min-h-0 flex-1 overflow-auto">
        <div
          ref={contentRef}
          className="relative flex min-h-full flex-col"
          style={{ minWidth: trackMinWidth(ticks.length, scale) }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{ paddingTop: HEADER_HEIGHT, paddingLeft: RAIL_WIDTH }}
          >
            <div ref={trackRef} className="relative h-full">
              {currentBand && (
                <div
                  style={spanStyle(currentBand.from, currentBand.to, total)}
                  className="bg-brand/[0.035] absolute inset-y-0"
                />
              )}

              {scale === "weeks" &&
                bands.minor.map(
                  // both day scales start on a Monday, so the offset doubles as the weekday
                  (band) =>
                    band.from % 7 >= 5 && (
                      <div
                        key={band.key}
                        style={spanStyle(band.from, band.to, total)}
                        className="bg-ink/[0.025] absolute inset-y-0"
                      />
                    ),
                )}

              {gridLines.map(({ at, strong }) => (
                <div
                  key={at}
                  style={{ left: `${(at / total) * 100}%` }}
                  className={cn(
                    "absolute inset-y-0 w-px",
                    strong ? "bg-(--list-line)" : "bg-hairline/70",
                  )}
                />
              ))}
            </div>
          </div>

          {fraction !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 z-[1]"
              style={{
                top: HEADER_HEIGHT,
                left: `calc(${RAIL_WIDTH} + (100% - ${RAIL_WIDTH}) * ${fraction})`,
              }}
            >
              <div className="bg-brand/70 absolute inset-y-0 -left-px w-0.5" />
              <div className="border-t-brand absolute top-0 -left-[5px] size-0 border-x-[5px] border-t-[6px] border-x-transparent" />
            </div>
          )}

          <TodayHover
            contentRef={contentRef}
            trackRef={trackRef}
            fraction={fraction}
            label={todayLabel}
            disabled={draft !== null}
          />

          <div
            className="sticky top-0 z-30 flex shrink-0 border-b border-(--list-line) bg-(--list-head)"
            style={{ height: HEADER_HEIGHT }}
          >
            <div className="sticky left-0 z-10 flex w-(--timeline-rail) shrink-0 border-r border-(--list-line) bg-(--list-head)">
              <HeadCell
                id="work"
                label={columnLabels.work}
                className={WORK_CELL}
                columns={columns}
                onColumns={onColumns}
                rootRef={rootRef}
                leading={
                  <span className="grid size-5 shrink-0 place-items-center">
                    {onToggleAll && (
                      <button
                        type="button"
                        onClick={onToggleAll}
                        aria-expanded={allExpanded}
                        aria-label={
                          allExpanded
                            ? t("list.collapseAll")
                            : t("list.expandAll")
                        }
                        className="text-ink-3 hover:text-ink hover:bg-ink/10 focus-visible:ring-brand grid size-5 place-items-center rounded transition-colors outline-none focus-visible:ring-2"
                      >
                        <ChevronRightIcon
                          className={cn(
                            "size-3.5 transition-transform duration-150",
                            allExpanded && "rotate-90",
                          )}
                        />
                      </button>
                    )}
                  </span>
                }
              />

              {railColumns.status && (
                <HeadCell
                  id="status"
                  label={columnLabels.status}
                  className={cn(SIDE_CELL, "w-(--tl-status)")}
                  columns={columns}
                  onColumns={onColumns}
                  rootRef={rootRef}
                />
              )}

              {railColumns.assignee && (
                <HeadCell
                  id="assignee"
                  label={columnLabels.assignee}
                  className={cn(SIDE_CELL, "w-(--tl-assignee)")}
                  columns={columns}
                  onColumns={onColumns}
                  rootRef={rootRef}
                />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative h-6">
                {bands.major.map((band) => {
                  const room = (band.to - band.from) * pxPerDay;
                  const short = room < 110;

                  return (
                    <div
                      key={band.key}
                      title={bandLabel(band, locale)}
                      style={spanStyle(band.from, band.to, total)}
                      className={cn(
                        "text-mini absolute inset-y-0 flex items-center overflow-clip border-(--list-line) tracking-tight",
                        band.from > 0 && "border-l",
                        band === currentBand
                          ? "text-ink font-semibold"
                          : "text-ink-3 font-medium",
                      )}
                    >
                      <span
                        className="sticky truncate px-2"
                        style={{ left: RAIL_WIDTH }}
                      >
                        {room >= 48 && bandLabel(band, locale, { short })}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="relative flex-1">
                {bands.minor.map((band) => {
                  const day = band.kind === "day";
                  const weekend = scale === "weeks" && band.from % 7 >= 5;
                  const isToday = scale === "weeks" && band.from === todayIndex;
                  const monthStart =
                    scale === "weeks"
                      ? band.key.endsWith("-01")
                      : scale === "quarters" && band.from > 0;

                  return (
                    <div
                      key={band.key}
                      style={spanStyle(band.from, band.to, total)}
                      title={isToday ? todayLabel : bandLabel(band, locale)}
                      className={cn(
                        "text-micro absolute inset-y-0 flex items-center overflow-clip tabular-nums",
                        day ? "justify-center" : "px-2",
                        monthStart && "border-l border-(--list-line)",
                        weekend ? "bg-ink/[0.03] text-ink-3/45" : "text-ink-3",
                      )}
                    >
                      <span
                        className={cn(
                          day
                            ? "grid size-6 place-items-center rounded-full"
                            : "truncate",
                          isToday && "bg-brand text-brand-fg font-semibold",
                        )}
                      >
                        {(day || (band.to - band.from) * pxPerDay >= 48) &&
                          bandLabel(band, locale, { short: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {empty && <Empty {...empty} />}

          {!empty && sprintsEnabled && sprints.length > 0 && (
            <TimelineSprintBand
              sprints={sprints}
              locale={locale}
              today={today}
              onOpen={onOpenSprint}
            />
          )}

          {!empty && rendered}

          {/* the only create affordance for epics — shown even when the axis is empty */}
          <TimelineCreateRow
            ticks={ticks}
            scale={scale}
            draft={draft?.key === CREATE_EPIC_KEY ? draft.range : null}
            pending={pending?.key === CREATE_EPIC_KEY ? pending : null}
            today={today}
            locale={locale}
            interactive={interactive}
            label={t("timeline.createEpic")}
            placeholder={t("timeline.epicName")}
            onBegin={(event) =>
              begin(event, {
                key: CREATE_EPIC_KEY,
                node: null,
                mode: "draw",
                base: null,
              })
            }
            onStart={() => setPending({ key: CREATE_EPIC_KEY, range: null })}
            onSubmit={(title) => {
              if (pending?.key === CREATE_EPIC_KEY) {
                onCreateEpic(title, pending.range);
              }

              setPending(null);
            }}
            onCancel={() =>
              setPending((current) =>
                current?.key === CREATE_EPIC_KEY ? null : current,
              )
            }
          />

          {/* the rail runs to the bottom, so nothing behind it shows through below the last row */}
          <div className="flex min-h-6 flex-1">
            <div className={cn(RAIL, "group-hover:bg-(--list-row)")}>
              {(["work", "status", "assignee"] as const)
                .filter((id) => id === "work" || railColumns[id])
                .map((id) => (
                  <div key={id} className={cn("relative", RAIL_CELL[id])}>
                    <RailResizer
                      id={id}
                      label={columnLabels[id]}
                      columns={columns}
                      onColumns={onColumns}
                      rootRef={rootRef}
                      grip
                    />
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// The empty cells under the last row that carry each column's body grip.
const RAIL_CELL: Record<TimelineColumnId, string> = {
  work: cn("shrink-0", WORK_CELL),
  status: "hidden w-(--tl-status) shrink-0 md:block",
  assignee: "hidden w-(--tl-assignee) shrink-0 md:block",
};

// The widest a rail column's cells would be with nothing truncated, by the
// same rule the List's columns fit by.
function fittedRailWidth(
  root: HTMLElement,
  id: TimelineColumnId,
): number | null {
  const header = root.querySelector<HTMLElement>(`[data-tl-head="${id}"]`);

  if (!header) return null;

  const cells = sample([
    ...root.querySelectorAll<HTMLElement>(`[data-tl-col="${id}"]`),
  ]);
  const [head, ...body] = naturalWidths([header, ...cells], root);

  return fitWidth(
    head,
    body,
    TIMELINE_COLUMNS[id].min,
    MAX_TIMELINE_COLUMN_WIDTH,
  );
}

interface RailColumnProps {
  id: TimelineColumnId;
  label: string;
  columns: TimelineColumnPrefs;
  onColumns: (
    change: (prefs: TimelineColumnPrefs) => TimelineColumnPrefs,
  ) => void;
  rootRef: RefObject<HTMLDivElement | null>;
}

function fitRailColumn({
  id,
  onColumns,
  rootRef,
}: Pick<RailColumnProps, "id" | "onColumns" | "rootRef">) {
  const root = rootRef.current;
  const width = root && fittedRailWidth(root, id);

  if (width !== null) {
    onColumns((prefs) => withTimelineColumnWidth(prefs, id, width));
  }
}

function RailResizer({
  grip = false,
  ...props
}: RailColumnProps & { grip?: boolean }) {
  const { t } = useTranslation();
  const { id, label, columns, onColumns, rootRef } = props;
  const width = timelineColumnWidth(columns, id);
  const variable = `--tl-${id}`;

  return (
    <ResizeHandle
      label={t("list.resize", { name: label })}
      hint={t("list.resizeHint")}
      value={width}
      min={TIMELINE_COLUMNS[id].min}
      max={MAX_TIMELINE_COLUMN_WIDTH}
      begin={(handle) =>
        handle.parentElement?.getBoundingClientRect().width ?? width
      }
      preview={(next) =>
        rootRef.current?.style.setProperty(variable, `${next}px`)
      }
      commit={(next) =>
        onColumns((prefs) => withTimelineColumnWidth(prefs, id, next))
      }
      cancel={() => rootRef.current?.style.setProperty(variable, `${width}px`)}
      fit={() => fitRailColumn(props)}
      grip={grip}
      partner={() =>
        rootRef.current?.querySelector<HTMLElement>(
          `[data-tl-head="${id}"] [role=separator]`,
        )
      }
      // below md the rail is capped at 10rem, so a width there changes nothing
      className="-right-px max-md:hidden"
    />
  );
}

function HeadCell({
  className,
  leading,
  ...props
}: RailColumnProps & { className: string; leading?: ReactNode }) {
  const { t } = useTranslation();
  const { id, label, onColumns } = props;

  return (
    <div
      data-tl-head={id}
      className={cn(
        "group/th text-ink-2 relative flex h-full min-w-0 shrink-0 items-center gap-1.5 pr-1 text-xs font-semibold",
        id === "work" && "pl-2",
        className,
      )}
    >
      {leading}
      <span className="min-w-0 flex-1 truncate">{label}</span>

      <span className="max-md:hidden">
        <TableColumnMenu
          name={label}
          groups={[
            [
              {
                label: t("list.fitContent"),
                icon: ArrowLeftRightIcon,
                run: () => fitRailColumn(props),
              },
              {
                label: t("list.resetWidth"),
                icon: RotateCcwIcon,
                run: () =>
                  onColumns((prefs) =>
                    withTimelineColumnWidth(prefs, id, null),
                  ),
              },
            ],
            TIMELINE_COLUMNS[id].optional
              ? [
                  {
                    label: t("list.hideColumn"),
                    icon: EyeOffIcon,
                    run: () =>
                      onColumns((prefs) =>
                        withTimelineColumnShown(prefs, id, false),
                      ),
                  },
                ]
              : [],
          ]}
        />
      </span>

      <RailResizer {...props} />
    </div>
  );
}

// Hovering the line anywhere names the day it marks. Measured from the pointer
// rather than given its own hit area, which would sit on top of the bars it
// crosses and steal their drags.
function TodayHover({
  contentRef,
  trackRef,
  fraction,
  label,
  disabled,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  trackRef: RefObject<HTMLDivElement | null>;
  fraction: number | null;
  label: string;
  disabled: boolean;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const content = contentRef.current;

    if (!content || fraction === null || disabled) return;

    let frame = 0;
    let last: PointerEvent | null = null;

    const check = () => {
      frame = 0;

      const track = trackRef.current;

      if (!last || !track) return;

      const box = track.getBoundingClientRect();
      const area = content.getBoundingClientRect();
      const x = box.left + box.width * fraction;
      const near = Math.abs(last.clientX - x) <= 5 && last.clientY > box.top;

      setAt(near ? { x: x - area.left, y: last.clientY - area.top } : null);
    };

    const move = (event: PointerEvent) => {
      last = event;

      if (!frame) frame = requestAnimationFrame(check);
    };

    const leave = () => setAt(null);

    content.addEventListener("pointermove", move);
    content.addEventListener("pointerleave", leave);

    return () => {
      cancelAnimationFrame(frame);
      content.removeEventListener("pointermove", move);
      content.removeEventListener("pointerleave", leave);
      setAt(null);
    };
  }, [contentRef, trackRef, fraction, disabled]);

  if (!at) return null;

  return (
    <div
      role="tooltip"
      style={{ left: at.x, top: at.y }}
      className="bg-ink text-canvas text-mini shadow-e2 pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md px-2 py-1 font-medium whitespace-nowrap"
    >
      {label}
    </div>
  );
}

// Rendered inside the grid, not instead of it — an empty board with its axis still visible reads as "nothing planned", not "broken view".
function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <EmptyState
      icon={CalendarRangeIcon}
      title={title}
      hint={hint}
      className="relative"
    />
  );
}
