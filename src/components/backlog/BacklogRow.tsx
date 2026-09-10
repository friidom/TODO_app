import { memo, useEffect, useMemo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";

import { workTypeOf } from "@/constants/workTypes";
import { useBoardId } from "@/hooks/useBoardId";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { sprintAssignmentPatch } from "@/services/todos/backlog";
import type { IColumn, Sprint, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";
import AssigneeControl from "@/components/todo/TodoItem/AssigneeControl";
import EstimateControl from "@/components/todo/TodoItem/EstimateControl";
import StatusControl from "@/components/todo/TodoItem/StatusControl";
import SprintControl from "@/components/todo/TodoItem/SprintControl";

const BACKLOG_GRID =
  "grid items-center gap-x-2 px-3 grid-cols-[3.75rem_minmax(0,1fr)_7.5rem_2.5rem_5.5rem_9rem]";

// drag and the SprintControl dropdown both end at sprintAssignmentPatch — one function, so they can't disagree about where a card lands.
// split into BacklogRow/BacklogRowContent because useDraggable's context updates bypass memo — without the split every row re-renders on every pointer move during a drag.
export default function BacklogRow({
  todo,
  sprints,
  columns,
}: {
  todo: Todo;
  sprints: Sprint[];
  columns: IColumn[];
}) {
  const { canEditTodos } = usePermissions();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: todo.id,
    data: { type: "backlog-item", todo },
    disabled: !canEditTodos,
  });

  // useDraggable rebuilds listeners on most renders — keep it behind a stable identity or it defeats the memo below.
  const listenersRef = useRef(listeners);

  useEffect(() => {
    listenersRef.current = listeners;
  });

  const listenerKeys = listeners ? Object.keys(listeners).sort().join(",") : "";

  const stableListeners = useMemo(() => {
    const out: Record<string, (event: unknown) => void> = {};

    for (const key of listenerKeys ? listenerKeys.split(",") : []) {
      out[key] = (event) =>
        (
          listenersRef.current as
            Record<string, ((e: unknown) => void) | undefined> | undefined
        )?.[key]?.(event);
    }

    return out;
  }, [listenerKeys]);

  const handleProps = useMemo(
    () => ({ ...attributes, ...stableListeners }),
    [attributes, stableListeners],
  );

  return (
    <BacklogRowContent
      todo={todo}
      sprints={sprints}
      columns={columns}
      isDragging={isDragging}
      setNodeRef={setNodeRef}
      handleProps={handleProps}
    />
  );
}

const BacklogRowContent = memo(function BacklogRowContent({
  todo,
  sprints,
  columns,
  isDragging,
  setNodeRef,
  handleProps,
}: {
  todo: Todo;
  sprints: Sprint[];
  columns: IColumn[];
  isDragging: boolean;
  setNodeRef: (element: HTMLElement | null) => void;
  handleProps: Record<string, unknown>;
}) {
  const { openTask } = useOpenTask();
  const { canEditTodos } = usePermissions();
  const patch = useTodoPatch(todo);
  const key = taskKey(useKeyPrefix(), todo.board_key);
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  const type = workTypeOf(todo.type);
  const TypeIcon = type.icon;

  const inert = canEditTodos ? undefined : "pointer-events-none";
  const activeSprintId = activeSprintIdOf(sprints);

  function assignSprint(sprintId: string | null) {
    const todos =
      queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

    patch(
      sprintAssignmentPatch(todo, sprintId, activeSprintId, columns, todos),
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...handleProps}
      role="row"
      className={cn(
        BACKLOG_GRID,
        // touch-none/select-none — without them a touch drag's first move gets eaten by native scroll before dnd-kit sees it
        "border-hairline group hover:bg-ink/[0.035] h-11 touch-none border-b transition-colors duration-150 select-none last:border-b-0",
        isDragging && "opacity-50",
      )}
    >
      <div role="cell" className="min-w-0">
        {key !== null ? (
          <button
            type="button"
            onClick={() => openTask(todo.id)}
            title={`Open ${key}`}
            className="text-ink-3/80 hover:text-brand focus-visible:ring-brand text-mini block truncate rounded font-medium tabular-nums transition-colors outline-none focus-visible:ring-2"
          >
            {key}
          </button>
        ) : (
          <span className="text-ink-3/40 text-mini">—</span>
        )}
      </div>

      <div role="cell" className="flex min-w-0 items-center gap-1.5">
        <TypeIcon className={cn("size-3.5 shrink-0", type.tone)} />

        <button
          type="button"
          onClick={() => openTask(todo.id)}
          title={todo.title ?? undefined}
          className="text-ink hover:text-brand focus-visible:ring-brand text-meta block min-w-0 flex-1 truncate rounded text-left font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {todo.title || <span className="text-ink-3/60">Untitled</span>}
        </button>
      </div>

      <div role="cell" className={cn("flex min-w-0", inert)}>
        <StatusControl todoId={todo.id} columnId={todo.column_id} />
      </div>

      <div role="cell" className={cn("flex justify-center", inert)}>
        <EstimateControl
          value={todo.estimate}
          onChange={(estimate) => patch({ estimate })}
        />
      </div>

      <div role="cell" className={cn("flex justify-center", inert)}>
        <AssigneeControl
          boardId={todo.board_id}
          value={todo.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
        />
      </div>

      <div role="cell" className={cn("flex justify-end", inert)}>
        <SprintControl
          value={todo.sprint_id}
          sprints={sprints}
          onChange={assignSprint}
        />
      </div>
    </div>
  );
});
