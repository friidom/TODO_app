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
import AssigneeControl from "@/components/todo/TodoItem/AssigneeControl";
import EstimateControl from "@/components/todo/TodoItem/EstimateControl";
import StatusControl from "@/components/todo/TodoItem/StatusControl";
import SprintControl from "@/components/todo/TodoItem/SprintControl";

/** The grid every Backlog row shares — the same "one elastic title track,
 * fixed metadata tracks" shape `SUBTASK_GRID`/`TASK_GRID` already use.
 * `StatusControl` (M31) and `EstimateControl` (M31-B) are two tracks M29
 * never had; the `2.5rem` estimate track is exactly `EstimateControl`'s own
 * `size-6` plus its row's padding, the same "control decides its own size,
 * the grid just gives it a slot" relationship every other track here has. */
const BACKLOG_GRID =
  "grid items-center gap-x-2 px-3 grid-cols-[3.75rem_minmax(0,1fr)_7.5rem_2.5rem_5.5rem_9rem]";

/**
 * One work item in the Backlog view (M29) — an Epic or a top-level/Epic's-own
 * Task, never a genuine Subtask (excluded upstream by `useVisibleTodos`, the
 * same gate every other view reads through).
 *
 * **Moving between the Backlog and a Sprint is both a drag and this row's
 * `SprintControl` (M31 adds the drag; M29 shipped the control alone).** Both
 * end at the exact same write, `sprintAssignmentPatch` — one function
 * deciding "assign a Sprint" so a drag and a dropdown pick can never
 * disagree about where a card lands or whether it picks up a column.
 * `useDraggable` here supplies only the pickup; `BacklogView`'s `DndContext`
 * and each section's own `useDroppable` (`SprintSection`, and the Backlog's
 * own list) do the rest — the same `@dnd-kit/core` primitives the Board's
 * own drag already uses, not a second implementation.
 *
 * **The Status column is `StatusControl`, unchanged.** It already writes
 * nothing of its own — it calls `useMoveTodo`, the same mutation the Board's
 * drag and its own three-dot menu use — so a row here that changes status
 * updates the Board, the cache and this item's Activity/History through the
 * exact path those surfaces already share. Nothing about "which column" is
 * decided twice.
 *
 * **The estimate cell is `EstimateControl` (M31-B), the same component
 * `TodoCard` uses on the Board — not a second read-only pill next to a
 * separate editable one.** It is fully controlled (`value`/`onChange`) and
 * writes nothing itself; `onChange={(estimate) => patch({estimate})}` is the
 * same `useTodoPatch` → `useUpdateTodo` path every other field on this row
 * already goes through, so an edit here updates this row, the Sprint's own
 * Story Point totals (`sprintPoints` reads the same `["todos", boardId]`
 * cache) and the Board in one write. It already knows how to sit inside a
 * draggable ancestor — its own click handler stops propagation specifically
 * because `TodoCard` spreads dnd-kit listeners on its root the same way this
 * row does — so nothing extra was needed to let it coexist with the drag.
 *
 * **Choosing "no sprint" here also clears `column_id`, and that clear is the
 * whole mechanism.** Board membership is `column_id` and nothing else
 * (`useTodosByColumns`), so taking a card out of every Sprint has to drop
 * its column too or the card would sit on the Board unchanged — "Backlog
 * items are not shown on the Board" would simply not be true. Assigning
 * *into* a sprint gives it a column only when that Sprint is the active one
 * and it has none yet (`sprintAssignmentPatch`) — otherwise `start_sprint`
 * is what puts a sprint's work on the Board, not the act of planning it.
 *
 * **Split into `BacklogRow` / `BacklogRowContent` the same way `TodoItem` is
 * (M9-05), and for the same measured reason.** `useDraggable` subscribes to
 * dnd-kit's drag context, so this outer component re-renders on every
 * pointer move regardless of `memo` — context updates bypass it. Left alone,
 * that re-render cascades into every control below (`StatusControl`,
 * `EstimateControl`, `AssigneeControl`, `SprintControl`) for every row on the
 * page, on every gap the pointer crosses, which is the actual source of drag
 * jank here — not the indicator itself. `BacklogRowContent` is the memo
 * boundary that stops it: it only re-renders for the one row whose own
 * `todo`/`sprints`/`columns`/`isDragging` actually changed.
 */
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

  /**
   * dnd-kit's `listeners`, behind a stable identity — the same fix
   * `TodoItem.tsx`'s `DraggableTodo` makes, for the same measured reason:
   * `useDraggable` rebuilds `listeners` on most renders, and spreading it
   * straight into `handleProps` would rebuild that object every time too,
   * defeating `BacklogRowContent`'s memo on every pointer move rather than
   * only when a row's own data changes.
   */
  const listenersRef = useRef(listeners);

  useEffect(() => {
    listenersRef.current = listeners;
  });

  const listenerKeys = listeners
    ? Object.keys(listeners).sort().join(",")
    : "";

  const stableListeners = useMemo(() => {
    const out: Record<string, (event: unknown) => void> = {};

    for (const key of listenerKeys ? listenerKeys.split(",") : []) {
      out[key] = (event) =>
        (
          listenersRef.current as
            | Record<string, ((e: unknown) => void) | undefined>
            | undefined
        )?.[key]?.(event);
    }

    return out;
  }, [listenerKeys]);

  // Stable across the re-renders `useDraggable` forces here, so the memo on
  // `BacklogRowContent` actually holds. Rebuilt only when `attributes`
  // itself changes, which dnd-kit does rarely (see `TodoItem.tsx`'s own
  // measurement: 0 times for `setNodeRef`, twice for `attributes`, versus
  // 1,224 times for `listeners`, across 1,643 renders of one drag).
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
  const activeSprintId =
    sprints.find((sprint) => sprint.state === "active")?.id ?? null;

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
        // `touch-none select-none` match `TodoCard`'s own root exactly
        // (`components/todo/TodoCard.tsx`) — without them a touch drag's
        // first move is claimed by the browser's native scroll/text-select
        // gesture before `@dnd-kit`'s PointerSensor ever sees it, which is
        // what "sometimes cannot be dragged at all" looks like from here.
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
