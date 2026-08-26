import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  LayersIcon,
  PlusIcon,
} from "lucide-react";

import AssigneeControl from "./TodoItem/AssigneeControl";
import PriorityControl from "./TodoItem/PriorityControl";
import StatusControl from "./TodoItem/StatusControl";
import { Skeleton } from "@/components/ui/skeleton";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { useAddTodo } from "@/services/todos/useAddTodo";
import { canPickEpicParent } from "@/services/todos/subtasks";
import { useEpicTasks } from "@/services/todos/useSubtasks";
import { useTodos } from "@/services/todos/useTodos";
import { useUpdateTodo } from "@/services/todos/useUpdateTodo";
import type { Todo } from "@/types/data";
import { byRank } from "@/utils/rank";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

/** Same shape as `SubtasksSection`'s table — Work · Priority · Assignee ·
 * Status — kept as a separate constant rather than shared, so a change to
 * one table's columns is not silently a change to both. */
const TASK_GRID =
  "grid items-center gap-x-2 px-3 grid-cols-[3.75rem_minmax(0,1fr)_1.5rem_1.5rem_7.5rem]";

/**
 * One Epic's own Tasks (M28-A) — the container side of the hierarchy, sitting
 * where `SubtasksSection` sits for a Task, and never mounted alongside it:
 * `TaskDetailModal` renders exactly one of the two, decided by
 * `useTodoHierarchy`.
 *
 * **No progress bar.** The plan defers an Epic's own progress indicator to
 * M31 — this is a list of what the Epic contains, not a measure of how
 * finished it is, and `subtaskProgressByParent` (the card indicator's own
 * source) deliberately excludes Epic-parented rows from its count for the
 * same reason.
 *
 * **Two ways in, one relationship mechanism.** Creating a Task here and
 * picking an existing one both end at the same write — `parent_id =
 * epic.id` — through the existing `useAddTodo`/`useUpdateTodo` mutations.
 * Neither is a new path; this component is a second way to reach the one
 * `parent_id` column M27 introduced.
 */
export default function EpicTasksSection({ epic }: { epic: Todo }) {
  const { tasks, isPending } = useEpicTasks(epic.id);
  const { canEditTodos } = usePermissions();

  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} tasks`}
          onClick={() => setCollapsed((open) => !open)}
          className="text-ink-3 hover:text-ink hover:bg-ink/10 focus-visible:ring-brand -ml-1 rounded p-1 transition-colors outline-none focus-visible:ring-2"
        >
          {collapsed ? (
            <ChevronRightIcon className="size-4" />
          ) : (
            <ChevronDownIcon className="size-4" />
          )}
        </button>

        <h3 className="text-ink-3 text-mini font-semibold tracking-[0.08em] uppercase">
          Tasks
        </h3>

        {tasks.length > 0 && (
          <span className="bg-ink/10 text-ink-3 text-mini shrink-0 rounded px-1.5 py-0.5 font-semibold tabular-nums">
            {tasks.length}
          </span>
        )}

        {canEditTodos && (
          <button
            type="button"
            onClick={() => {
              setCollapsed(false);
              setAdding((open) => !open);
            }}
            aria-label="Add task to this epic"
            title="Add task"
            className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand ml-auto grid size-6 shrink-0 place-items-center rounded transition-colors outline-none focus-visible:ring-2"
          >
            <PlusIcon className="size-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {adding && (
            <AddEpicTaskPanel
              epic={epic}
              onDone={() => setAdding(false)}
              hasRows={tasks.length > 0}
            />
          )}

          {isPending ? (
            <div className="mt-2 space-y-2" aria-busy>
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : tasks.length === 0 && !adding ? (
            <div className="text-ink-3 flex items-center gap-2 py-1 text-sm">
              <LayersIcon className="size-4 shrink-0" />
              <span>
                No tasks in this epic yet.
                {canEditTodos && " Add one with the + above."}
              </span>
            </div>
          ) : (
            tasks.length > 0 && (
              <div
                role="table"
                aria-label="Tasks in this epic"
                className={cn(
                  "border-hairline rounded-card overflow-hidden border",
                  adding && "mt-2",
                )}
              >
                <div
                  role="row"
                  className={cn(
                    TASK_GRID,
                    "border-hairline text-ink-3/70 text-micro bg-surface/40 h-8 border-b font-medium tracking-[0.08em] uppercase",
                  )}
                >
                  <span role="columnheader">Work</span>
                  <span role="columnheader">
                    <span className="sr-only">Title</span>
                  </span>
                  <span role="columnheader">
                    <span className="sr-only">Priority</span>
                  </span>
                  <span role="columnheader">
                    <span className="sr-only">Assignee</span>
                  </span>
                  <span role="columnheader">Status</span>
                </div>

                {tasks.map((task) => (
                  <EpicTaskRow key={task.id} task={task} />
                ))}
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}

/** One Task belonging to this Epic — identical columns to `SubtasksSection`'s
 * row, kept as a sibling rather than a shared component (see the module
 * doc). */
function EpicTaskRow({ task }: { task: Todo }) {
  const { openTask } = useOpenTask();
  const patch = useTodoPatch(task);
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), task.board_key);

  const inert = canEditTodos ? undefined : "pointer-events-none";

  return (
    <div
      role="row"
      className={cn(
        TASK_GRID,
        "border-hairline group hover:bg-ink/[0.035] h-11 border-b transition-colors duration-150 last:border-b-0",
      )}
    >
      <div role="cell" className="min-w-0">
        {key !== null ? (
          <button
            type="button"
            onClick={() => openTask(task.id)}
            title={`Open ${key}`}
            className="text-ink-3/80 hover:text-brand focus-visible:ring-brand text-mini block truncate rounded font-medium tabular-nums transition-colors outline-none focus-visible:ring-2"
          >
            {key}
          </button>
        ) : (
          <span className="text-ink-3/40 text-mini">—</span>
        )}
      </div>

      <div role="cell" className="min-w-0">
        <button
          type="button"
          onClick={() => openTask(task.id)}
          title={task.title ?? undefined}
          className="text-ink hover:text-brand focus-visible:ring-brand text-meta block w-full truncate rounded text-left font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {task.title || <span className="text-ink-3/60">Untitled</span>}
        </button>
      </div>

      <div role="cell" className={cn("flex", inert)}>
        <PriorityControl
          bare
          value={task.priority}
          onChange={(priority) => patch({ priority })}
        />
      </div>

      <div role="cell" className={cn("flex", inert)}>
        <AssigneeControl
          boardId={task.board_id}
          value={task.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
        />
      </div>

      <div role="cell" className={cn("flex min-w-0", inert)}>
        <StatusControl todoId={task.id} columnId={task.column_id} />
      </div>
    </div>
  );
}

/**
 * The two ways in: type a title to create one, or pick one that already
 * exists. Both end at the same `parent_id = epic.id` write.
 */
function AddEpicTaskPanel({
  epic,
  onDone,
  hasRows,
}: {
  epic: Todo;
  onDone: () => void;
  hasRows: boolean;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");

  return (
    <div className={cn(hasRows ? "mt-2" : "mt-0")}>
      <div className="mb-1.5 flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => setMode("new")}
          className={cn(
            "font-medium transition-colors",
            mode === "new" ? "text-brand" : "text-ink-3 hover:text-ink-2",
          )}
        >
          New task
        </button>
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={cn(
            "font-medium transition-colors",
            mode === "existing" ? "text-brand" : "text-ink-3 hover:text-ink-2",
          )}
        >
          Existing task
        </button>
      </div>

      {mode === "new" ? (
        <NewEpicTaskRow epic={epic} onDone={onDone} />
      ) : (
        <ExistingTaskPicker epic={epic} onDone={onDone} />
      )}
    </div>
  );
}

/**
 * Create a new Task under this Epic — the same single-line flow
 * `AddSubtaskRow` uses, targeting `useAddTodo` instead of `useAddSubtask`:
 * unlike a Subtask, a Task under an Epic is a real board card and belongs in
 * a real column, so it goes through the ordinary create path with `parent_id`
 * riding along, not the Subtask-specific one that deliberately skips column
 * placement.
 */
function NewEpicTaskRow({ epic, onDone }: { epic: Todo; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const { data: columns = [] } = useColumns();
  const add = useAddTodo();

  const value = title.trim();

  // The board's own first column, by rank — the same "start where new work
  // starts" default a brand-new card gets from the header's quick-add form.
  // An Epic has no column of its own for a child to inherit the way a
  // Subtask inherits its Task's.
  const firstColumn = columns.slice().sort(byRank)[0];

  function submit() {
    if (value === "" || !firstColumn) {
      onDone();
      return;
    }

    add.mutate({
      title: value,
      column_id: firstColumn.id,
      parent_id: epic.id,
    });

    setTitle("");
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();

          if (event.key === "Escape") {
            event.preventDefault();
            onDone();
          }
        }}
        onBlur={submit}
        placeholder="What needs doing?"
        aria-label="New task title"
        className="border-hairline text-ink placeholder:text-ink-3 focus:border-brand/60 focus:ring-brand/25 rounded-control min-w-0 flex-1 border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-2"
      />

      <button
        type="button"
        onMouseDown={onDone}
        className="text-ink-3 hover:text-ink rounded-control shrink-0 px-2 py-1 text-xs font-medium"
      >
        Done
      </button>
    </div>
  );
}

/**
 * Assign an existing top-level (or other-Epic) Task to this Epic.
 *
 * The candidate list is exactly `canPickEpicParent` — the same predicate
 * `EpicParentControl` filters by, read the other direction: everything that
 * could legally choose this Epic as its parent, minus what already has.
 * Offering anything wider (a Subtask, another Epic, this Epic's own
 * existing Tasks) would be offering a write the database refuses or a
 * no-op.
 */
function ExistingTaskPicker({
  epic,
  onDone,
}: {
  epic: Todo;
  onDone: () => void;
}) {
  const { data: todos = [] } = useTodos();
  const keyPrefix = useKeyPrefix();
  const update = useUpdateTodo();

  const candidates = todos.filter(
    (todo) =>
      todo.id !== epic.id &&
      todo.parent_id !== epic.id &&
      canPickEpicParent(todos, todo),
  );

  return (
    <div className="border-hairline rounded-card max-h-48 overflow-y-auto border">
      {candidates.length === 0 ? (
        <p className="text-ink-3 px-2.5 py-3 text-xs">
          No other tasks are available to add.
        </p>
      ) : (
        <ul>
          {candidates.map((candidate) => {
            const key = taskKey(keyPrefix, candidate.board_key);

            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => {
                    update.mutate({
                      id: candidate.id,
                      board_id: candidate.board_id,
                      parent_id: epic.id,
                    });
                    onDone();
                  }}
                  className="hover:bg-ink/10 focus-visible:bg-ink/10 flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors outline-none"
                >
                  {key && (
                    <span className="text-ink-3 text-mini shrink-0 tabular-nums">
                      {key}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.title || "Untitled"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
