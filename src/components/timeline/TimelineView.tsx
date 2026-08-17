import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import ViewNotice from "@/components/board/ViewNotice";
import Loading from "@/components/loading/LoadingPage";
import { useBoardView } from "@/hooks/useBoardView";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { useTimelineView } from "@/hooks/useTimelineView";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
import {
  placeItems,
  timelineItems,
  timelineTicks,
  unscheduledTodos,
} from "@/services/views/timeline";
import { todayISO } from "@/utils/dueDate";
import TimelineGrid from "./TimelineGrid";
import TimelineNav from "./TimelineNav";

/**
 * The board's work as ranges over time (M20).
 *
 * **A renderer over M16's pipeline, like the other four.** It reads the same
 * `useVisibleTodos()` the board, the list, the summary and the calendar read, so
 * the filter and the search are not merely consistent between five views — they
 * are one computation over one cache entry. Flipping to the timeline changes a
 * search param, not a query.
 *
 * **It writes nothing, and that is the milestone's decision rather than an
 * omission.** M20 specifies a schema change, a range rule and a derived row
 * order; it specifies no drag. Dragging a bar is two different gestures wearing
 * one affordance — move the whole range, or move one end — and neither is
 * described anywhere in the plan, so building them here would be inventing
 * scope. A range is edited where the plan puts it: the task detail's Details
 * rail, where Start date now sits beside Due date, and both write through the
 * same `useTodoPatch` every other field uses.
 *
 * **Row order is derived from the dates and stored nowhere.** `timelineItems`
 * sorts; nothing here can reorder. That is what keeps `todos.position` at
 * exactly one writer and stops this view reopening M3-10 and M6-A — see the
 * plan's own note on why a draggable Gantt was ruled out before it was drawn.
 *
 * The sort control is hidden for this view (`canSort: false` in the registry),
 * because time is the axis — a "sort by priority" has nothing to reorder when
 * the rows are laid out by when they happen.
 */
export default function TimelineView() {
  const view = useBoardView();
  const timeline = useTimelineView();
  const { i18n } = useTranslation();

  const { todos, isLoading, error } = useVisibleTodos();
  const { data: columns = [] } = useColumns();
  const { openTask } = useOpenTask();
  const keyPrefix = useKeyPrefix();

  const today = todayISO();

  const ticks = useMemo(
    () => timelineTicks(timeline.scale, timeline.anchor),
    [timeline.scale, timeline.anchor],
  );

  const items = useMemo(() => timelineItems(todos), [todos]);

  const rows = useMemo(
    () => placeItems(items, ticks, timeline.scale),
    [items, ticks, timeline.scale],
  );

  const columnById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  // Two different absences, reported separately because they have two different
  // answers: an undated item needs a date, an off-window one needs paging to.
  // The undated ones are listed under the axis as well as counted — see the
  // grid's `Undated` section.
  const undated = useMemo(() => unscheduledTodos(todos), [todos]);
  const offWindow = items.length - rows.length;

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* No drag hint: this view has no drag to lose to a sort or a grouping.
          The empty-filter case is as real here as everywhere. */}
      <ViewNotice view={view} visibleCount={todos.length} />

      <TimelineNav
        view={timeline}
        ticks={ticks}
        locale={i18n.language}
        unscheduled={undated.length}
        offWindow={offWindow}
      />

      <TimelineGrid
        rows={rows}
        undated={undated}
        ticks={ticks}
        scale={timeline.scale}
        columnById={columnById}
        keyPrefix={keyPrefix}
        locale={i18n.language}
        today={today}
        onOpenTask={openTask}
        emptyReason={
          rows.length > 0
            ? null
            : items.length > 0
              ? {
                  title: "Nothing scheduled in this range",
                  hint: `${items.length} dated ${items.length === 1 ? "item is" : "items are"} outside it. Page through the dates, or jump back to today.`,
                }
              : {
                  title: "No work item has dates yet",
                  hint: "Open a task and set a start date, a due date, or both — anything with a date appears here.",
                }
        }
      />
    </div>
  );
}
