import { useCallback, useState } from "react";
import { CalendarRangeIcon, ChevronRightIcon } from "lucide-react";

import { useTimelineDrag, CREATE_EPIC_KEY } from "@/hooks/useTimelineDrag";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { NO_SUBTASKS, type SubtaskProgress } from "@/services/todos/subtasks";
import type { Schedulable } from "@/services/todos/useTimelineSchedule";
import { monthLabel } from "@/services/views/calendar";
import {
  bandAnchor,
  monthBands,
  placeItem,
  tickIndexOf,
  tickLabel,
  type TimelineScale,
} from "@/services/views/timeline";
import type { PlacedTimelineHierarchy } from "@/services/views/timelineHierarchy";
import type { DayRange, DragMode } from "@/services/views/timelineDrag";
import type { IColumn, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import EmptyState from "@/components/ui/EmptyState";
import TimelineCreateRow from "./TimelineCreateRow";
import TimelineEpicGroup from "./TimelineEpicGroup";
import TimelineSprintBand from "./TimelineSprintBand";
import { Row, RowRail } from "./TimelineRow";
import {
  HEADER_HEIGHT,
  RAIL_WIDTH,
  ROW_HEIGHT,
  trackColumns,
  trackMinWidth,
} from "./timelineAxis";

export type CreateOptions = { type?: string; parentId?: string | null };

// One scroll container — the rail sticks left, the header sticks top, and both scroll with the same content so they can't drift apart.
// The axis is one absolutely-positioned layer behind every row, and it's also what the drag gestures measure against (trackRef),
// so pixel-to-column math can never disagree with where the bars actually render.
export default function TimelineGrid({
  hierarchy,
  epicProgress,
  collapsedEpics,
  onToggleEpic,
  undated,
  ticks,
  scale,
  columnById,
  keyPrefix,
  locale,
  today,
  interactive,
  onOpenTask,
  onOpenSprint,
  onSchedule,
  onCreate,
  emptyReason,
}: {
  hierarchy: PlacedTimelineHierarchy;
  epicProgress: Map<string, SubtaskProgress>;
  collapsedEpics: Set<string>;
  onToggleEpic: (epicId: string) => void;
  undated: Todo[];
  ticks: string[];
  scale: TimelineScale;
  columnById: Map<string, IColumn>;
  keyPrefix: string;
  locale?: string;
  today: string;
  interactive: boolean;
  onOpenTask: (id: string) => void;
  onOpenSprint: (sprintId: string) => void;
  onSchedule: (todo: Schedulable, range: DayRange) => Promise<unknown>;
  onCreate: (title: string, range: DayRange, options?: CreateOptions) => void;
  emptyReason: { title: string; hint: string } | null;
}) {
  const sprintsEnabled = useSprintsEnabled();

  const bands = monthBands(ticks);
  const todayIndex = tickIndexOf(today, ticks, scale);
  const columns = trackColumns(ticks.length, scale);

  const [pending, setPending] = useState<{
    key: string;
    range: DayRange;
  } | null>(null);

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

  const monthStarts = new Set(bands.map((band) => band.index));

  const currentMonth = today.slice(0, 7);

  return (
    <div className="border-hairline rounded-surface bg-surface mb-4 flex min-h-0 flex-1 flex-col overflow-hidden border">
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative min-h-full"
          style={{ minWidth: trackMinWidth(ticks.length, scale) }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{ paddingTop: HEADER_HEIGHT, paddingLeft: RAIL_WIDTH }}
          >
            <div
              ref={trackRef}
              className="grid h-full"
              style={{ gridTemplateColumns: columns }}
            >
              {ticks.map((day, index) => (
                <div
                  key={day}
                  className={cn(
                    "border-r",
                    monthStarts.has(index)
                      ? "border-hairline"
                      : "border-hairline/40",
                    scale === "weeks" && index % 7 >= 5 && "bg-ink/[0.025]",
                  )}
                />
              ))}
            </div>
          </div>

          {todayIndex !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 z-0"
              style={{
                top: HEADER_HEIGHT,
                left: `calc(${RAIL_WIDTH} + (100% - ${RAIL_WIDTH}) * ${
                  (todayIndex + 0.5) / ticks.length
                })`,
              }}
            >
              <div className="bg-brand/45 h-full w-0.5" />
              <div className="bg-brand absolute -top-1 -left-[3px] size-2 rounded-full" />
            </div>
          )}

          <div className="border-hairline bg-canvas sticky top-0 z-30 border-b">
            <div className="flex h-6">
              <HeaderRail />

              <div
                className="grid flex-1"
                style={{ gridTemplateColumns: columns }}
              >
                {bands.map((band) => (
                  <div
                    key={band.key}
                    style={{
                      gridColumn: `${band.index + 1} / span ${band.span}`,
                    }}
                    className={cn(
                      "border-hairline text-mini flex items-center truncate border-l px-2 tracking-tight first:border-l-0",
                      band.key === currentMonth
                        ? "text-ink font-semibold"
                        : "text-ink-3 font-medium",
                    )}
                  >
                    {monthLabel(bandAnchor(band.key), locale)}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex h-7">
              <HeaderRail />

              <div
                className="grid flex-1"
                style={{ gridTemplateColumns: columns }}
              >
                {ticks.map((day, index) => {
                  // both scales start on a Monday, so index doubles as weekday
                  const weekend = scale === "weeks" && index % 7 >= 5;
                  const isToday = index === todayIndex;

                  return (
                    <div
                      key={day}
                      className={cn(
                        "text-micro flex items-center justify-center tabular-nums",
                        monthStarts.has(index) && index > 0
                          ? "border-hairline border-l"
                          : "",
                        weekend ? "bg-ink/[0.03] text-ink-3/45" : "text-ink-3",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-6 place-items-center rounded-full",
                          isToday && "bg-brand text-brand-fg font-semibold",
                        )}
                      >
                        {tickLabel(day)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {emptyReason && <Empty {...emptyReason} />}

          {!emptyReason && sprintsEnabled && hierarchy.sprints.length > 0 && (
            <TimelineSprintBand
              sprints={hierarchy.sprints}
              ticks={ticks}
              scale={scale}
              locale={locale}
              today={today}
              onOpen={onOpenSprint}
            />
          )}

          {!emptyReason &&
            hierarchy.epics.map((group) => {
              const epicId = group.group.epic.id;

              return (
                <TimelineEpicGroup
                  key={epicId}
                  placed={group}
                  ticks={ticks}
                  scale={scale}
                  columnById={columnById}
                  keyPrefix={keyPrefix}
                  locale={locale}
                  today={today}
                  interactive={interactive}
                  progress={epicProgress.get(epicId) ?? NO_SUBTASKS}
                  collapsed={collapsedEpics.has(epicId)}
                  onToggleCollapse={() => onToggleEpic(epicId)}
                  draft={draft}
                  dragging={dragging}
                  onOpenTask={open}
                  onGrab={begin}
                />
              );
            })}

          {/* the only create affordance on this view — shown even when the axis is empty */}
          <TimelineCreateRow
            ticks={ticks}
            scale={scale}
            draft={draft?.key === CREATE_EPIC_KEY ? draft.range : null}
            pending={pending?.key === CREATE_EPIC_KEY ? pending.range : null}
            today={today}
            locale={locale}
            interactive={interactive}
            label="Create epic"
            placeholder="Epic name"
            onBegin={(event) =>
              begin(event, {
                key: CREATE_EPIC_KEY,
                todo: null,
                mode: "draw",
                base: null,
              })
            }
            onSubmit={(title) => {
              if (pending?.key === CREATE_EPIC_KEY) {
                onCreate(title, pending.range, { type: "Epic" });
              }

              setPending(null);
            }}
            onCancel={() =>
              setPending((current) =>
                current?.key === CREATE_EPIC_KEY ? null : current,
              )
            }
          />

          <Undated
            todos={undated}
            ticks={ticks}
            scale={scale}
            keyPrefix={keyPrefix}
            interactive={interactive}
            draft={draft}
            onOpenTask={open}
            onBegin={begin}
          />
        </div>
      </div>
    </div>
  );
}

// Empty — exists only so the header lines up with the sticky rail below it.
function HeaderRail() {
  return (
    <div className="border-hairline bg-canvas sticky left-0 z-10 w-(--timeline-rail) shrink-0 border-r" />
  );
}

// Items with no date get no honest column, so they're listed below the axis instead, with an empty track to schedule them into.
// Collapsed by default — on a young board this is most of the items.
function Undated({
  todos,
  ticks,
  scale,
  keyPrefix,
  interactive,
  draft,
  onOpenTask,
  onBegin,
}: {
  todos: Todo[];
  ticks: string[];
  scale: TimelineScale;
  keyPrefix: string;
  interactive: boolean;
  draft: { key: string; range: DayRange } | null;
  onOpenTask: (id: string) => void;
  onBegin: (
    event: React.PointerEvent,
    target: {
      key: string;
      todo: Schedulable;
      mode: DragMode | "draw";
      base: null;
    },
  ) => void;
}) {
  const [open, setOpen] = useState(false);

  if (todos.length === 0) return null;

  return (
    <div className="relative">
      <div
        className={cn(
          "border-hairline bg-elevated/60 flex border-t border-b",
          ROW_HEIGHT,
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((it) => !it)}
          aria-expanded={open}
          className="text-ink-2 hover:text-ink focus-visible:ring-brand border-hairline text-mini sticky left-0 flex w-(--timeline-rail) shrink-0 items-center gap-1.5 border-r px-3 text-left font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-150",
              open && "rotate-90",
            )}
          />
          No dates
          <span className="text-ink-3 tabular-nums">{todos.length}</span>
        </button>
      </div>

      {open &&
        todos.map((todo) => {
          const range = draft?.key === todo.id ? draft.range : null;
          const place = range ? placeItem(range, ticks, scale) : null;

          return (
            <Row key={todo.id}>
              <RowRail
                todo={todo}
                keyPrefix={keyPrefix}
                onOpen={() => onOpenTask(todo.id)}
                hint={interactive ? "drag to plan" : undefined}
              />

              <div
                onPointerDown={
                  interactive
                    ? (event) =>
                        onBegin(event, {
                          key: todo.id,
                          todo,
                          mode: "draw",
                          base: null,
                        })
                    : undefined
                }
                className={cn(
                  "grid flex-1 items-center",
                  interactive && "cursor-crosshair",
                )}
                style={{
                  gridTemplateColumns: trackColumns(ticks.length, scale),
                }}
              >
                {place && (
                  <span
                    aria-hidden
                    style={{
                      gridColumn: `${place.index + 1} / span ${place.span}`,
                    }}
                    className="border-brand bg-brand/25 mx-px h-5 rounded-[3px] border border-dashed"
                  />
                )}
              </div>
            </Row>
          );
        })}
    </div>
  );
}

// Rendered inside the grid, not instead of it — an empty month with its axis still visible reads as "nothing planned", not "broken view".
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
