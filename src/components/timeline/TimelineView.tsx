import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutationState } from "@tanstack/react-query";

import ViewNotice from "@/components/board/ViewNotice";
import ViewSkeleton from "@/components/loading/ViewSkeleton";
import ViewError from "@/components/loading/ViewError";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView } from "@/hooks/useBoardView";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimelineColumns } from "@/hooks/useTimelineColumns";
import { useTimelineView } from "@/hooks/useTimelineView";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import { EMPTY_WORKFLOW, defaultStatus } from "@/services/workflow/statuses";
import { useSprints } from "@/services/sprints/useSprints";
import { epicTaskProgress, subtasksByParent } from "@/services/todos/subtasks";
import { useAddSubtask } from "@/services/todos/useAddSubtask";
import { useAddTodo } from "@/services/todos/useAddTodo";
import { useTimelineSchedule } from "@/services/todos/useTimelineSchedule";
import { useTodos } from "@/services/todos/useTodos";
import { timelineTicks } from "@/services/views/timeline";
import {
  buildTimelineHierarchy,
  placeSprints,
  timelineCounts,
  walkTimeline,
  type TimelineNode,
} from "@/services/views/timelineHierarchy";
import type { DayRange } from "@/services/views/timelineDrag";
import type { Sprint, Todo } from "@/types/data";
import { fromCalendarDay, todayISO } from "@/utils/dueDate";
import CreateSprintModal from "@/components/backlog/CreateSprintModal";
import TimelineGrid from "./TimelineGrid";
import TimelineNav from "./TimelineNav";

const NO_TODOS: Todo[] = [];

// Dragging here only ever writes start_date/due_date, never todos.position — this is not a second surface that reorders the board.
export default function TimelineView() {
  const view = useBoardView();
  const timeline = useTimelineView();
  const { t, i18n } = useTranslation();
  const boardId = useBoardId();

  const { todos, isLoading, error } = useVisibleTodos();
  const { data: rows = NO_TODOS } = useTodos();
  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();
  const { data: sprints = [] } = useSprints();
  const { openTask } = useOpenTask();
  const { canEditTodos } = usePermissions();
  const keyPrefix = useKeyPrefix();
  const [columns, setColumns] = useTimelineColumns(boardId);

  const schedule = useTimelineSchedule();
  const addTodo = useAddTodo();
  const addSubtask = useAddSubtask();

  // One subscription for the whole view rather than one per row: the rows
  // whose date write is still in flight, so their bars can say so.
  const writing = useMutationState({
    filters: { mutationKey: ["todo-write"], status: "pending" },
    select: (mutation) =>
      (mutation.state.variables as { id?: string } | undefined)?.id,
  });

  const saving = useMemo(
    () => new Set(writing.filter((id): id is string => Boolean(id))),
    [writing],
  );

  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);

  // Collapsed until opened, the way Jira opens a timeline: the Epics read as
  // the plan, and their breakdown is one click away.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const today = todayISO();

  const ticks = useMemo(
    () => timelineTicks(timeline.scale, timeline.anchor),
    [timeline.scale, timeline.anchor],
  );

  // The pipeline drops genuine subtasks from every view; the timeline files
  // them back under their Task, unfiltered, as the List does.
  const subtasks = useMemo(() => subtasksByParent(rows), [rows]);

  const hierarchy = useMemo(
    () => buildTimelineHierarchy(todos, { subtasks, sprints }),
    [todos, subtasks, sprints],
  );

  const placedSprints = useMemo(
    () => placeSprints(hierarchy.sprints, ticks, timeline.scale),
    [hierarchy, ticks, timeline.scale],
  );

  const progress = useMemo(
    () => epicTaskProgress(todos, workflow.statuses),
    [todos, workflow.statuses],
  );

  const counts = useMemo(
    () => timelineCounts(hierarchy.epics, ticks, timeline.scale),
    [hierarchy, ticks, timeline.scale],
  );

  const expandable = useMemo(() => {
    const ids: string[] = [];

    walkTimeline(hierarchy.epics, (node) => {
      if (node.children.length > 0) ids.push(node.todo.id);
    });

    return ids;
  }, [hierarchy]);

  const allExpanded =
    expandable.length > 0 && expandable.every((id) => expanded.has(id));

  const toggle = useCallback(
    (id: string) =>
      setExpanded((current) => {
        const next = new Set(current);

        if (!next.delete(id)) next.add(id);

        return next;
      }),
    [],
  );

  const expand = useCallback(
    (id: string) =>
      setExpanded((current) =>
        current.has(id) ? current : new Set(current).add(id),
      ),
    [],
  );

  const createStatusId = defaultStatus(workflow.statuses)?.id ?? null;

  function createEpic(title: string, range: DayRange | null) {
    if (!createStatusId) return;

    addTodo.mutate({
      title,
      status_id: createStatusId,
      start_date: range && fromCalendarDay(range.start),
      due_date: range && fromCalendarDay(range.end),
      type: "Epic",
      parent_id: null,
    });
  }

  // No dates on purpose: a child with none takes an even share of its parent's
  // range on the timeline, and keeps re-flowing until someone sets its own.
  function createChild(parent: TimelineNode, title: string) {
    if (!createStatusId) return;

    if (parent.depth === 0) {
      addTodo.mutate({
        title,
        status_id: createStatusId,
        parent_id: parent.todo.id,
      });
    } else {
      addSubtask.mutate({
        title,
        parentId: parent.todo.id,
        statusId: createStatusId,
      });
    }
  }

  if (isLoading) return <ViewSkeleton mode="timeline" />;

  if (error) return <ViewError error={error} />;

  return (
    <div className="motion-safe:animate-in motion-safe:fade-in-0 flex h-full min-h-0 flex-col duration-200">
      <ViewNotice view={view} visibleCount={todos.length} />

      <TimelineNav
        view={timeline}
        ticks={ticks}
        locale={i18n.language}
        unscheduled={counts.undated}
        offWindow={counts.offWindow}
        columns={columns}
        onColumns={setColumns}
      />

      <TimelineGrid
        epics={hierarchy.epics}
        sprints={placedSprints}
        expanded={expanded}
        onToggle={toggle}
        onExpand={expand}
        onToggleAll={
          expandable.length > 0
            ? () => setExpanded(allExpanded ? new Set() : new Set(expandable))
            : null
        }
        allExpanded={allExpanded}
        ticks={ticks}
        scale={timeline.scale}
        statusById={workflow.statusById}
        keyPrefix={keyPrefix}
        locale={i18n.language}
        today={today}
        interactive={canEditTodos && Boolean(createStatusId)}
        progress={progress}
        saving={saving}
        columns={columns}
        onColumns={setColumns}
        onOpenTask={openTask}
        onOpenSprint={(sprintId) =>
          setEditingSprint(
            sprints.find((sprint) => sprint.id === sprintId) ?? null,
          )
        }
        onSchedule={schedule}
        onCreateEpic={createEpic}
        onCreateChild={createChild}
        onJump={timeline.goTo}
        empty={
          hierarchy.epics.length > 0
            ? null
            : {
                title: t("timeline.noEpicsTitle"),
                hint: t("timeline.noEpicsHint"),
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
