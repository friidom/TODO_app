import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslation } from "react-i18next";

import ViewNotice from "@/components/board/ViewNotice";
import Loading from "@/components/loading/LoadingPage";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView } from "@/hooks/useBoardView";
import { useCalendarView } from "@/hooks/useCalendarView";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { useCalendarDrop } from "@/services/todos/useCalendarDrop";
import {
  groupByDueDay,
  matrixFor,
  offscreenCount,
  undatedTodos,
} from "@/services/views/calendar";
import type { Todo } from "@/types/data";
import { todayISO } from "@/utils/dueDate";
import CalendarChip from "./CalendarChip";
import CalendarGrid from "./CalendarGrid";
import CalendarNav from "./CalendarNav";
import UndatedStrip from "./UndatedStrip";

/**
 * The board's work placed on dates (M19).
 *
 * **A renderer over M16's pipeline, and nothing more.** It reads the same
 * `useVisibleTodos()` the Kanban and the list read, so the filter and the search
 * are not merely consistent between the three views — they are the same
 * computation, over the same cache entry, with no second query and no second
 * model. Flipping to the calendar changes one search param.
 *
 * The sort is deliberately not honoured, and the registry says so
 * (`canSort: false`): dates *are* this view's order. Grouping is off for the
 * same kind of reason — the date grouping is the layout, and a second one would
 * mean either swimlanes of calendars or a calendar quietly showing one person's
 * work.
 *
 * **Its own `DndContext`, not the board's.** `useKanbanDnd` exists to answer
 * "which gap between which two cards", with a custom `collisionDetection` that
 * measures gaps and paints an indicator. A calendar drop answers "which day" —
 * big rectangles, no internal order — so `closestCenter` over the day cells is
 * the whole of it. Reusing the board's hook would mean bending a gap-finder
 * around a question that has no gaps, and touching a file M19 is told not to
 * change.
 *
 * **The write is `updateTodo`, the one every field control already uses.** See
 * `useCalendarDrop` — the milestone rules out a second mutation and a second
 * optimistic layer, so a drop here is the same write as picking a date from the
 * card's popover.
 */
export default function CalendarView() {
  const boardId = useBoardId();
  const view = useBoardView();
  const calendar = useCalendarView();
  const { i18n } = useTranslation();

  const { todos, isLoading, error } = useVisibleTodos();
  const { data: members = [] } = useBoardMembers(boardId);
  const { canEditTodos } = usePermissions();
  const { openTask } = useOpenTask();
  const keyPrefix = useKeyPrefix();
  const drop = useCalendarDrop();

  /**
   * Whether the undated strip is open.
   *
   * Client-only state, not a search param — the same call `KanbanBoard` makes
   * for which columns are collapsed. A panel being open is a property of this
   * tab in this browser, not of the view worth putting in a shared link, and
   * `useCalendarView`'s two params are the ones that are.
   */
  const [stripCollapsed, setStripCollapsed] = useState(false);

  const [dragging, setDragging] = useState<Todo | null>(null);

  const today = todayISO();

  const days = useMemo(
    () => matrixFor(calendar.layout, calendar.anchor),
    [calendar.layout, calendar.anchor],
  );

  const byDay = useMemo(() => groupByDueDay(todos), [todos]);
  const undated = useMemo(() => undatedTodos(todos), [todos]);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );

  // The strip counts as "shown" even collapsed: collapsing it does not hide
  // the work, and the collapsed rail keeps reporting the count.
  const offscreen = useMemo(
    () => offscreenCount(todos, days, true),
    [todos, days],
  );

  const sensors = useSensors(
    // 8px, matching the board exactly. A chip is also a click target — it opens
    // the task modal — so the threshold is what separates "I tapped this" from
    // "I am moving this", and having two answers to that in one product would
    // make the calendar feel like a different application.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart({ active }: DragStartEvent) {
    setDragging((active.data.current?.todo as Todo | undefined) ?? null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);

    if (!over) return;

    const todo = active.data.current?.todo as Todo | undefined;

    if (!todo) return;

    // `day` is a string on a day cell and null on the undated strip, which is
    // what makes clearing a date the same code path as setting one. `undefined`
    // means the drop landed on something that is not a date target at all.
    const day = over.data.current?.day as string | null | undefined;

    if (day === undefined) return;

    drop(todo, day);
  }

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* No drag hint: the calendar's drag is never disabled by a sort or a
            grouping, because it does not honour either. The empty-filter case
            is real here as everywhere. */}
        <ViewNotice view={view} visibleCount={todos.length} />

        <CalendarNav
          view={calendar}
          locale={i18n.language}
          offscreen={offscreen}
        />

        <div className="flex min-h-0 flex-1 gap-3 pb-4">
          <CalendarGrid
            days={days}
            anchor={calendar.anchor}
            layout={calendar.layout}
            byDay={byDay}
            today={today}
            keyPrefix={keyPrefix}
            memberById={memberById}
            canEdit={canEditTodos}
            onOpenTask={openTask}
            // "+N more" switches to the week holding that day rather than
            // opening a popover. A popover would be a fourth surface that lists
            // work items, with its own scroll and its own empty state; the week
            // layout already exists, already shows a whole day, and is a place
            // you can keep working from.
            //
            // One action rather than an anchor write plus a layout write: two
            // param writes in one handler both build on the render's params,
            // so the second wins. `useCalendarView` carries the mechanism.
            onOpenDay={calendar.openDay}
            locale={i18n.language}
          />

          <UndatedStrip
            todos={undated}
            keyPrefix={keyPrefix}
            memberById={memberById}
            canEdit={canEditTodos}
            collapsed={stripCollapsed}
            onToggle={() => setStripCollapsed((open) => !open)}
            onOpenTask={openTask}
          />
        </div>
      </div>

      {/* The travelling copy. Nothing in the grid reflows during a drag — the
          original stays in place at reduced opacity — which is the same
          interaction model the board uses and the reason a drop never lands
          somewhere the layout moved to. */}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="w-44">
            <CalendarChip
              todo={dragging}
              keyPrefix={keyPrefix}
              assignee={
                dragging.assignee_id
                  ? memberById.get(dragging.assignee_id)
                  : undefined
              }
              draggable={false}
              onOpen={() => {}}
              overlay
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
