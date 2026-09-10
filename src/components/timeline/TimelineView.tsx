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
import { useSprints } from "@/services/sprints/useSprints";
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
import type { Sprint } from "@/types/data";
import { fromCalendarDay, todayISO } from "@/utils/dueDate";
import CreateSprintModal from "@/components/backlog/CreateSprintModal";
import type { CreateOptions } from "./TimelineGrid";
import TimelineGrid from "./TimelineGrid";
import TimelineNav from "./TimelineNav";

// Dragging here only ever writes start_date/due_date, never todos.position — this is not a second surface that reorders the board.
export default function TimelineView() {
  const view = useBoardView();
  const timeline = useTimelineView();
  const { i18n } = useTranslation();

  const { todos, isLoading, error } = useVisibleTodos();
  const { data: columns = [] } = useColumns();
  const { data: sprints = [] } = useSprints();
  const { openTask } = useOpenTask();
  const { canEditTodos } = usePermissions();
  const keyPrefix = useKeyPrefix();

  const schedule = useTimelineSchedule();
  const addTodo = useAddTodo();

  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);

  const today = todayISO();

  const ticks = useMemo(
    () => timelineTicks(timeline.scale, timeline.anchor),
    [timeline.scale, timeline.anchor],
  );

  const hierarchy = useMemo(
    () => buildTimelineHierarchy(todos, sprints),
    [todos, sprints],
  );

  const placed = useMemo(
    () => placeTimelineHierarchy(hierarchy, ticks, timeline.scale),
    [hierarchy, ticks, timeline.scale],
  );

  const epicProgress = useMemo(
    () => epicTaskProgress(todos, columns),
    [todos, columns],
  );

  const [collapsedEpics, setCollapsedEpics] = useState<Set<string>>(
    () => new Set(),
  );

  // Epics start collapsed, but the lazy useState initializer runs before todos load, so wait for the real list and seed once.
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

  const undated = useMemo(
    () => undatedTimelineTodos(todos, sprints),
    [todos, sprints],
  );
  const totalDated = countHierarchyItems(hierarchy);
  const offWindow = totalDated - countPlacedHierarchyItems(placed);

  const createColumnId = columns[0]?.id ?? null;

  function create(title: string, range: DayRange, options?: CreateOptions) {
    if (!createColumnId) return;

    addTodo.mutate({
      title,
      column_id: createColumnId,
      start_date: fromCalendarDay(range.start),
      due_date: fromCalendarDay(range.end),
      type: options?.type,
      parent_id: options?.parentId ?? null,
    });
  }

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
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
        interactive={canEditTodos && Boolean(createColumnId)}
        onOpenTask={openTask}
        onOpenSprint={(sprintId) =>
          setEditingSprint(
            sprints.find((sprint) => sprint.id === sprintId) ?? null,
          )
        }
        onSchedule={schedule}
        onCreate={create}
        emptyReason={
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

      {editingSprint && (
        <CreateSprintModal
          sprint={editingSprint}
          onClose={() => setEditingSprint(null)}
        />
      )}
    </div>
  );
}
