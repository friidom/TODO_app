import { useCallback, useState } from "react";
import { CalendarRangeIcon, ChevronRightIcon } from "lucide-react";

import { useTimelineDrag, CREATE_EPIC_KEY } from "@/hooks/useTimelineDrag";
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

/** What a create gesture is for — threaded through to `useAddTodo` unchanged
 * (M28-B). Omitted fields keep `useAddTodo`'s own defaults: a plain Task with
 * no parent, exactly as every create surface behaved before this milestone. */
export type CreateOptions = { type?: string; parentId?: string | null };

/**
 * The axis and everything on it (M20, planning gestures M20-B).
 *
 * **One scroll container, and the rail is sticky inside it.** The obvious
 * alternative — a fixed label column beside a separately scrolling track — puts
 * two scrollbars on screen and needs their positions synchronised on every
 * frame; the moment they disagree, a bar sits opposite the wrong name. Here the
 * header sticks to the top, each row's label sticks to the left, and both are
 * the *same* scrolled content, so they cannot drift.
 *
 * **The axis is drawn once, full height, behind the rows** — a single
 * absolutely positioned layer spanning the whole scroller, so a board with four
 * dated items shows four bars *on a calendar* rather than four bars above a
 * void. Drawing the rules per row instead would mean every row repeating thirty
 * elements and stopping dead where the data does.
 *
 * **That same layer is what the gestures measure against**, which is why it
 * carries `trackRef`. Its inner grid is the track *by construction* — it is
 * inset past the rail and below the header and holds one cell per tick — so
 * pixel-to-column can never disagree with the columns the bars are placed in.
 * Measuring a row instead would mean a different element per row and a
 * different answer whenever one of them was scrolled out.
 *
 * **The column count is fixed by the scale, never by the data.** `timelineTicks`
 * always returns the same number of columns, so paging a week changes the width
 * of nothing. The columns are `minmax(min, 1fr)`: they stretch to fill a wide
 * screen and hold their minimum on a narrow one, where the whole grid scrolls
 * sideways as a single object.
 */
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
  /** One entry per Epic that has at least one Task — the header badge (M28-B). */
  epicProgress: Map<string, SubtaskProgress>;
  /** Epic ids whose Tasks are hidden. Client-only, like the board's own
   * collapsed columns — a layout preference, not data worth persisting. */
  collapsedEpics: Set<string>;
  onToggleEpic: (epicId: string) => void;
  /** Items with no date at all — listed below the axis, and schedulable there. */
  undated: Todo[];
  ticks: string[];
  scale: TimelineScale;
  columnById: Map<string, IColumn>;
  keyPrefix: string;
  locale?: string;
  today: string;
  /** Editor and above. A viewer reads the timeline but does not plan on it. */
  interactive: boolean;
  onOpenTask: (id: string) => void;
  /** A Sprint bar was clicked — opens its own edit form (`CreateSprintModal`,
   * the same one the Backlog page uses), never a Task's detail panel. */
  onOpenSprint: (sprintId: string) => void;
  onSchedule: (todo: Schedulable, range: DayRange) => Promise<unknown>;
  onCreate: (title: string, range: DayRange, options?: CreateOptions) => void;
  /** What to say when there is nothing to draw. Null when there is. */
  emptyReason: { title: string; hint: string } | null;
}) {
  const bands = monthBands(ticks);
  const todayIndex = tickIndexOf(today, ticks, scale);
  const columns = trackColumns(ticks.length, scale);

  /** A swept range waiting for a title, keyed by which create row drew it —
   * there are now several (M28-B), and only one may be filling in a title at
   * once. */
  const [pending, setPending] = useState<{
    key: string;
    range: DayRange;
  } | null>(null);

  // Destructured rather than kept as one object: `trackRef` is a ref, and
  // reaching the rest of the result through the same binding reads to the
  // linter (correctly) as touching a ref during render.
  const { trackRef, draft, dragging, begin, consumeClick } = useTimelineDrag({
    ticks,
    scale,
    enabled: interactive,
    onSchedule,
    onDraw: (key, range) => setPending({ key, range }),
  });

  // Stable, so `TimelineRow`'s memo holds — a fresh closure per render would
  // fail the comparison on every row and put all of them back into the drag's
  // render path, which is the exact cost the memo exists to avoid.
  const open = useCallback(
    (id: string) => {
      // The click that ends a drag must not also open the task. The board and
      // the calendar get this from dnd-kit's activation constraint; here the
      // gesture layer answers the same question directly.
      if (consumeClick()) return;

      onOpenTask(id);
    },
    [consumeClick, onOpenTask],
  );

  // Where each month begins, so those rules can be drawn a step stronger than
  // the ones between days. Derived from the bands the header already uses, so
  // the emphasis in the grid and the label above it cannot disagree.
  const monthStarts = new Set(bands.map((band) => band.index));

  const currentMonth = today.slice(0, 7);

  return (
    <div className="border-hairline rounded-surface bg-surface mb-4 flex min-h-0 flex-1 flex-col overflow-hidden border">
      <div className="min-h-0 flex-1 overflow-auto">
        {/* `min-h-full` is what lets the axis fill the scroller rather than
            stopping at the last row. */}
        <div
          className="relative min-h-full"
          style={{ minWidth: trackMinWidth(ticks.length, scale) }}
        >
          {/* THE AXIS. Inset past the rail and below the header by padding, so
              its grid measures exactly the track and every rule lands on a
              column edge. `aria-hidden` because it is ruling, not content —
              the dates are read from the header. */}
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
                    // Weekends only mean something when a column is a day.
                    scale === "weeks" && index % 7 >= 5 && "bg-ink/[0.025]",
                  )}
                />
              ))}
            </div>
          </div>

          {/* TODAY. One line down the whole scroller, drawn once rather than as
              a tinted cell in every row. It sits in the same layer as the grid,
              so the rows — which paint no background of their own — let it show
              through, while a bar crossing it covers it, which is the right
              way round. */}
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
              {/* A cap at the top, so the rule reads as a marker rather than as
                  one more grid line that happens to be purple. */}
              <div className="bg-brand absolute -top-1 -left-[3px] size-2 rounded-full" />
            </div>
          )}

          {/* THE HEADER — two rows, and deliberately the quietest thing here.
              The months name the span; the numbers locate a column. */}
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
                      // The month you are in, named louder than the ones you
                      // are looking towards. One weight change, no fill — a
                      // tinted band across six columns would compete with the
                      // bars it sits above.
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
                  // Both scales start on a Monday, so the index is the weekday
                  // — no second date calculation, and it cannot fall out of
                  // step with the column it labels.
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

          {/* THE SPRINTS BAND — one row above every Epic group, never nested
              inside one (`timelineHierarchy.ts`'s own doc on why). Rendered
              only when there is at least one Sprint to show, so a board that
              has never used them sees the Timeline exactly as it always
              was. */}
          {!emptyReason && hierarchy.sprints.length > 0 && (
            <TimelineSprintBand
              sprints={hierarchy.sprints}
              ticks={ticks}
              scale={scale}
              locale={locale}
              today={today}
              onOpen={onOpenSprint}
            />
          )}

          {/* EPIC GROUPS — the only rows this Timeline draws (M28-B,
              corrected same milestone: see `timelineHierarchy.ts` on why a
              Task with no Epic has no row of its own here). Hidden behind
              `emptyReason`, but the create-epic row just past it is not, for
              the same reason the original single create row never was. */}
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

          {/* Offered even while the axis is empty — an empty timeline is
              precisely when you most want to put something on it. This is
              the Timeline's only create affordance, full stop (M31-B removed
              each Epic's own "+ Create task" row) — a Task still reaches an
              Epic the ordinary way, through its own detail panel or the
              Board. */}
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

/**
 * The header's own slice of the rail.
 *
 * Empty on purpose: the rail holds item names, and a heading over a list of
 * names says nothing the names do not. It exists so the header's two rows line
 * up with the rows beneath them, and it is sticky for the same reason theirs
 * are — it has to stay put while the axis scrolls under it.
 */
function HeaderRail() {
  return (
    <div className="border-hairline bg-canvas sticky left-0 z-10 w-(--timeline-rail) shrink-0 border-r" />
  );
}

/**
 * The work that has no dates — listed rather than counted, and now schedulable
 * where it is listed.
 *
 * **M20's rule was that a task with neither date "is not on the timeline", and
 * that is about placement.** There is no honest column to draw it in, and
 * inventing one is the only thing that would be worse than hiding it. So it is
 * listed under the axis, in the same rail shape a placed row has, with an empty
 * track beside it.
 *
 * **M20-B makes that empty track the place you give it a range.** The gesture
 * is the create row's, exactly — sweep two columns — and only the commit
 * differs: an id already exists, so it writes through `useTimelineSchedule`
 * rather than creating anything. Nothing is invented on hover or on render;
 * the dates appear because someone drew them, which is the same standard the
 * rest of this view holds to.
 *
 * Collapsed by default, because on a young board this is most of the items and
 * an expanded list of forty would bury the four rows that are actually
 * scheduled. The count is on the summary row either way.
 *
 * **`todos` is already narrowed to Epic-owned Tasks by the time it reaches
 * here** (`undatedTimelineTodos` in `timelineHierarchy.ts`, M28-B) — an
 * unparented Task has no row anywhere on this screen, dated or not, so this
 * is not a catch-all for "everything without a date" the way it first was.
 */
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
          // `border-r` like every other rail: without it the vertical line that
          // runs the full height of the grid stopped dead at this row and picked
          // up again underneath it.
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
                    // Same geometry as `TimelineBar`, like the create row's ghost.
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

/**
 * Nothing on the axis, and which of the two reasons it is.
 *
 * Inside the grid rather than replacing it: the axis is the explanation. An
 * empty September with its dates still on screen reads as "nothing is planned
 * here"; the same emptiness with no header reads as a broken view.
 */
function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="relative flex flex-col items-center gap-1 px-6 py-14 text-center">
      <span className="bg-ink/[0.06] text-ink-3 mb-3 grid size-10 place-items-center rounded-full">
        <CalendarRangeIcon className="size-4" />
      </span>

      <p className="text-ink text-sm font-medium">{title}</p>
      <p className="text-ink-3 max-w-xs text-xs leading-relaxed">{hint}</p>
    </div>
  );
}
