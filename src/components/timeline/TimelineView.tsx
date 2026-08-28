import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import ViewNotice from "@/components/board/ViewNotice";
import Loading from "@/components/loading/LoadingPage";
import { useBoardView } from "@/hooks/useBoardView";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimelineView } from "@/hooks/useTimelineView";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
import { epicTaskProgress } from "@/services/todos/subtasks";
import { useAddTodo } from "@/services/todos/useAddTodo";
import { useTimelineSchedule } from "@/services/todos/useTimelineSchedule";
import { timelineTicks } from "@/services/views/timeline";
import {
  buildTimelineHierarchy,
  countHierarchyItems,
  countPlacedHierarchyItems,
  placeTimelineHierarchy,
  undatedTimelineTodos,
} from "@/services/views/timelineHierarchy";
import type { DayRange } from "@/services/views/timelineDrag";
import { fromCalendarDay, todayISO } from "@/utils/dueDate";
import type { CreateOptions } from "./TimelineGrid";
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
 * **It is now the surface planning happens on (M20-B), and it still writes no
 * order.** M20 shipped it read-only and recorded why: a draggable Gantt was
 * feared to be *"a second surface that writes order"*, which would reopen M3-10
 * and M6-A. That fear was about `todos.position`, and the distinction is the
 * load-bearing one — **these gestures write `start_date` and `due_date`, and
 * nothing else.** Row order is still derived by `timelineItems` at render and
 * stored nowhere, `todos.position` still has exactly one writer, and
 * `registry.test.ts`'s guard passes untouched. It is the same argument the
 * calendar already makes for its own drag: `canReorder` means *writes
 * `todos.position`*, not *has drag and drop*.
 *
 * The two gestures M20 called "two different gestures wearing one affordance"
 * are separated by where you grab: the body moves the range, the ends move one
 * end each. Both commit through `useTimelineSchedule`, which is `useUpdateTodo`
 * — the same write the task detail's Start date and Due date controls make, so
 * dragging a bar and typing a date cannot disagree.
 *
 * **Creating from here uses the existing create flow**, widened by one existing
 * field: `useAddTodo` now carries `start_date`, so a task drawn on the axis is
 * an ordinary task that happens to have both ends. There is no second task
 * model and no second mutation.
 *
 * The sort control is hidden for this view (`canSort: false` in the registry),
 * because time is the axis — a "sort by priority" has nothing to reorder when
 * the rows are laid out by when they happen.
 *
 * **Grouped by Epic since M28-B — and, since the same milestone's own
 * correction, grouped by Epic ONLY.** `buildTimelineHierarchy`/
 * `placeTimelineHierarchy` (`timelineHierarchy.ts`) sit between
 * `useVisibleTodos()` and the grid, and every rule this comment already
 * states — one write path, no stored order, the existing create flow — still
 * governs each row. What changed after the first cut is *which* rows this
 * view draws at all: an Epic and its own Tasks, and nothing else. A Task with
 * no Epic — however many dates it carries — is in scope for the Board, the
 * List and the Calendar, never for this screen; see `timelineHierarchy.ts`'s
 * own header for why that line is drawn deliberately rather than left as a
 * gap.
 */
export default function TimelineView() {
  const view = useBoardView();
  const timeline = useTimelineView();
  const { i18n } = useTranslation();

  const { todos, isLoading, error } = useVisibleTodos();
  const { data: columns = [] } = useColumns();
  const { openTask } = useOpenTask();
  const { canEditTodos } = usePermissions();
  const keyPrefix = useKeyPrefix();

  const schedule = useTimelineSchedule();
  const addTodo = useAddTodo();

  const today = todayISO();

  const ticks = useMemo(
    () => timelineTicks(timeline.scale, timeline.anchor),
    [timeline.scale, timeline.anchor],
  );

  const hierarchy = useMemo(() => buildTimelineHierarchy(todos), [todos]);

  const placed = useMemo(
    () => placeTimelineHierarchy(hierarchy, ticks, timeline.scale),
    [hierarchy, ticks, timeline.scale],
  );

  const epicProgress = useMemo(
    () => epicTaskProgress(todos, columns),
    [todos, columns],
  );

  // Client-only, like `KanbanBoard`'s own collapsed columns — a layout
  // preference for this session, not data worth a round trip to persist.
  const [collapsedEpics, setCollapsedEpics] = useState<Set<string>>(
    () => new Set(),
  );

  // Every Epic starts collapsed (M31-B). A lazy `useState` initializer alone
  // cannot do this: it runs once, at mount, and `hierarchy` is still empty on
  // that very first render whenever `todos` has not loaded yet — a fresh
  // visit, not a tab switch inside the query's `staleTime`. Seeding from an
  // empty hierarchy would collapse nothing, and the initializer never runs
  // again once real data arrives. So this waits for the real Epic list and
  // seeds exactly once — `hasSeededCollapse` guards against re-collapsing an
  // Epic the user has since opened, on every later render this same array
  // reference changes.
  const hasSeededCollapse = useRef(false);

  useEffect(() => {
    if (hasSeededCollapse.current || isLoading || hierarchy.epics.length === 0)
      return;

    hasSeededCollapse.current = true;
    setCollapsedEpics(new Set(hierarchy.epics.map((group) => group.epic.id)));
  }, [isLoading, hierarchy]);

  const toggleEpic = (epicId: string) =>
    setCollapsedEpics((current) => {
      const next = new Set(current);

      if (next.has(epicId)) next.delete(epicId);
      else next.add(epicId);

      return next;
    });

  const columnById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  // Two different absences, reported separately because they have two different
  // answers: an undated item needs a date, an off-window one needs paging to.
  // The undated ones are listed under the axis as well as counted — see the
  // grid's `Undated` section. Neither an Epic nor an unparented Task is in
  // `undated` (M28-B, corrected same milestone): an Epic with no dates of
  // its own already has a row — the bare header `buildTimelineHierarchy`
  // still gives it — and a Task with no Epic is out of scope for this whole
  // view, not merely "not yet dated". What is left is a Task that already
  // belongs to an Epic and only needs its first range.
  const undated = useMemo(() => undatedTimelineTodos(todos), [todos]);
  const totalDated = countHierarchyItems(hierarchy);
  const offWindow = totalDated - countPlacedHierarchyItems(placed);

  /**
   * Where a task drawn on the axis lands.
   *
   * **The board's first column, which is its first status.** `getColumns`
   * orders by rank, so this is the leftmost column on the board — normally To
   * Do, and whatever the board's owner renamed it to otherwise. The create
   * form collects a title and nothing else for the reason `TodoCreateForm`
   * gives for having no status control: *"status is which column a card is in"*
   * — and unlike that form, this one is not inside one, so the only honest
   * default is the column the board itself puts first.
   */
  const createColumnId = columns[0]?.id ?? null;

  function create(title: string, range: DayRange, options?: CreateOptions) {
    if (!createColumnId) return;

    addTodo.mutate({
      title,
      column_id: createColumnId,
      // Both ends, in one insert. Sending them separately would put the row
      // through a moment of having a start and no end, and `addTodo` upserts —
      // so the follow-up would be a second write for a value the first already
      // knew.
      start_date: fromCalendarDay(range.start),
      due_date: fromCalendarDay(range.end),
      // Epic, always — "+ Create epic" is this view's only create row since
      // M31-B removed each Epic's own "+ Create task" one. `parentId` has no
      // caller left to set it, but stays on `CreateOptions` rather than being
      // ripped out of a function signature for a value that was never this
      // one's own idea in the first place.
      type: options?.type,
      parent_id: options?.parentId ?? null,
    });
  }

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
        hierarchy={placed}
        epicProgress={epicProgress}
        collapsedEpics={collapsedEpics}
        onToggleEpic={toggleEpic}
        undated={undated}
        ticks={ticks}
        scale={timeline.scale}
        columnById={columnById}
        keyPrefix={keyPrefix}
        locale={i18n.language}
        today={today}
        // Creating work and editing it are one permission (M3-05), and both
        // gestures here are one or the other.
        interactive={canEditTodos && Boolean(createColumnId)}
        onOpenTask={openTask}
        onSchedule={schedule}
        onCreate={create}
        emptyReason={
          // A bare Epic (no dates anywhere) still survives
          // `placeTimelineHierarchy`'s own filter unconditionally, so
          // "nothing placed" and "nothing to show" are not the same
          // question — the grid reads as empty only when there is no Epic
          // group at all for this page to draw. `totalDated` below is
          // Epic-owned dated rows only (M28-B correction) — a board full of
          // dated, unparented Tasks is *not* "dated items outside this
          // range" from this view's perspective, since none of them were
          // ever in scope for it.
          placed.epics.length > 0
            ? null
            : totalDated > 0
              ? {
                  title: "Nothing scheduled in this range",
                  hint: `${totalDated} dated ${totalDated === 1 ? "item is" : "items are"} outside it. Page through the dates, or jump back to today.`,
                }
              : {
                  title: "No epics have dates yet",
                  hint: "Create an epic below, or open one and set a start date, a due date, or both.",
                }
        }
      />
    </div>
  );
}
