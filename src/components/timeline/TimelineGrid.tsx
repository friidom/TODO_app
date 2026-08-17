import { useState } from "react";
import { CalendarRangeIcon, ChevronRightIcon } from "lucide-react";

import { monthLabel } from "@/services/views/calendar";
import {
  bandAnchor,
  monthBands,
  tickIndexOf,
  tickLabel,
  type placeItem,
  type TimelineItem,
  type TimelineScale,
} from "@/services/views/timeline";
import type { IColumn, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import TimelineRow, { Row, RowRail } from "./TimelineRow";
import {
  HEADER_HEIGHT,
  RAIL_WIDTH,
  ROW_HEIGHT,
  trackColumns,
  trackMinWidth,
} from "./timelineAxis";

type Placement = NonNullable<ReturnType<typeof placeItem>>;

/**
 * The axis and everything on it (M20).
 *
 * **One scroll container, and the rail is sticky inside it.** The obvious
 * alternative — a fixed label column beside a separately scrolling track — puts
 * two scrollbars on screen and needs their positions synchronised on every
 * frame; the moment they disagree, a bar sits opposite the wrong name. Here the
 * header sticks to the top, each row's label sticks to the left, and both are
 * the *same* scrolled content, so they cannot drift.
 *
 * **The axis is drawn once, full height, behind the rows.** This is what the
 * polish pass changed and it is the difference between a chart and a table with
 * markers in it: the column rules, the weekend tint and the today line are a
 * single absolutely positioned layer spanning the whole scroller, so a board
 * with four dated items shows four bars *on a calendar* rather than four bars
 * above a void. Drawing the rules per row instead would mean every row
 * repeating thirty-odd elements and stopping dead where the data does.
 *
 * **The column count is fixed by the scale, never by the data.** `timelineTicks`
 * always returns the same number of columns, so paging a week changes the width
 * of nothing. The columns are `minmax(min, 1fr)`: they stretch to fill a wide
 * screen and hold their minimum on a narrow one, where the whole grid scrolls
 * sideways as a single object.
 */
export default function TimelineGrid({
  rows,
  undated,
  ticks,
  scale,
  columnById,
  keyPrefix,
  locale,
  today,
  onOpenTask,
  emptyReason,
}: {
  rows: { item: TimelineItem; place: Placement }[];
  /** Items with no date at all — listed below the axis, never placed on it. */
  undated: Todo[];
  ticks: string[];
  scale: TimelineScale;
  columnById: Map<string, IColumn>;
  keyPrefix: string;
  locale?: string;
  today: string;
  onOpenTask: (id: string) => void;
  /** What to say when there is nothing to draw. Null when there is. */
  emptyReason: { title: string; hint: string } | null;
}) {
  const bands = monthBands(ticks);
  const todayIndex = tickIndexOf(today, ticks, scale);
  const columns = trackColumns(ticks.length, scale);

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
                      "border-hairline flex items-center truncate border-l px-2 text-[11px] tracking-tight first:border-l-0",
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
                        "flex items-center justify-center text-[10px] tabular-nums",
                        monthStarts.has(index) && index > 0
                          ? "border-hairline border-l"
                          : "",
                        weekend ? "bg-ink/[0.03] text-ink-3/45" : "text-ink-3",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-4 place-items-center rounded-full",
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

          {emptyReason ? (
            <Empty {...emptyReason} />
          ) : (
            rows.map(({ item, place }) => (
              <TimelineRow
                key={item.todo.id}
                item={item}
                place={place}
                ticks={ticks.length}
                scale={scale}
                column={
                  item.todo.column_id
                    ? columnById.get(item.todo.column_id)
                    : undefined
                }
                keyPrefix={keyPrefix}
                locale={locale}
                today={today}
                onOpen={() => onOpenTask(item.todo.id)}
              />
            ))
          )}

          <Undated
            todos={undated}
            keyPrefix={keyPrefix}
            onOpenTask={onOpenTask}
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
    <div className="border-hairline bg-canvas sticky left-0 z-10 w-60 shrink-0 border-r" />
  );
}

/**
 * The work that has no dates, listed rather than counted.
 *
 * **M20 says a task with neither date "is not on the timeline", and that is
 * about placement.** There is no honest column to draw it in, and inventing one
 * is the only thing that would be worse than hiding it. So it is listed under
 * the axis, in the same rail shape a placed row has, with an empty track beside
 * it — which also makes it obvious *why* it is down here.
 *
 * Collapsed by default, because on a young board this is most of the items and
 * an expanded list of forty would bury the four rows that are actually
 * scheduled. The count is on the summary row either way, so collapsing hides
 * nothing.
 */
function Undated({
  todos,
  keyPrefix,
  onOpenTask,
}: {
  todos: Todo[];
  keyPrefix: string;
  onOpenTask: (id: string) => void;
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
          className="text-ink-2 hover:text-ink focus-visible:ring-brand sticky left-0 flex w-60 shrink-0 items-center gap-1.5 px-3 text-left text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
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
        todos.map((todo) => (
          <Row key={todo.id}>
            <RowRail
              todo={todo}
              keyPrefix={keyPrefix}
              onOpen={() => onOpenTask(todo.id)}
            />

            {/* No track content, deliberately. The empty span beside the name
                is the statement: this item has nowhere to sit on the axis. */}
            <div className="flex-1" />
          </Row>
        ))}
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
