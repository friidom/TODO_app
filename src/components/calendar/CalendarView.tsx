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

// same useVisibleTodos() pipeline as Kanban/List — no second query, no second model, just a different render.
// its own DndContext with closestCenter, not the board's useKanbanDnd — a day-cell drop has no gaps to measure.
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

  // client-only, not a search param — not worth putting in a shared link
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

  const offscreen = useMemo(
    () => offscreenCount(todos, days, true),
    [todos, days],
  );

  const sensors = useSensors(
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

    // string on a day cell, null on the undated strip (clears the date), undefined if it's not a date target at all
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
            // "+N more" jumps to the week view instead of opening a popover — no second surface to build
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
