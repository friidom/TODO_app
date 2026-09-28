import { useState } from "react";
import { LayersIcon, PlusIcon } from "lucide-react";

import SectionHeader, { EmptyLine } from "./SectionHeader";
import AssigneeControl from "./TodoItem/AssigneeControl";
import PriorityControl from "./TodoItem/PriorityControl";
import StatusControl from "./TodoItem/StatusControl";
import {
  INLINE_ACTION,
  SEGMENT,
  SEGMENT_ACTIVE,
  SEGMENT_IDLE,
  SEGMENTED,
  TABLE,
  TABLE_HEAD,
  TABLE_ROW,
  TEXT_FIELD,
} from "./detailChrome";
import { MENU_ITEM } from "@/components/ui/controlChrome";
import IconButton from "@/components/ui/IconButton";
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

// Same shape as SubtasksSection's grid, kept separate so a column change to one isn't silently a change to both.
const TASK_GRID =
  "grid items-center gap-x-2 px-3 grid-cols-[3.75rem_minmax(0,1fr)_1.5rem_1.5rem_7.5rem]";

// Never mounted alongside SubtasksSection — TaskDetailModal renders exactly one, decided by useTodoHierarchy.
export default function EpicTasksSection({ epic }: { epic: Todo }) {
  const { tasks, isPending } = useEpicTasks(epic.id);
  const { canEditTodos } = usePermissions();

  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <SectionHeader
        title="Tasks"
        count={tasks.length > 0 ? tasks.length : null}
        collapse={{
          collapsed,
          onToggle: () => setCollapsed((open) => !open),
          noun: "tasks",
        }}
        actions={
          canEditTodos && (
            <IconButton
              label="Add task to this epic"
              aria-expanded={adding}
              onClick={() => {
                setCollapsed(false);
                setAdding((open) => !open);
              }}
            >
              <PlusIcon />
            </IconButton>
          )
        }
      />

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
            <EmptyLine icon={LayersIcon}>
              <span>
                No tasks in this epic yet.
                {canEditTodos && " Add one with the + above."}
              </span>
            </EmptyLine>
          ) : (
            tasks.length > 0 && (
              <div
                role="table"
                aria-label="Tasks in this epic"
                className={cn(TABLE, adding && "mt-3")}
              >
                <div role="row" className={cn(TASK_GRID, TABLE_HEAD)}>
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

function EpicTaskRow({ task }: { task: Todo }) {
  const { openTask } = useOpenTask();
  const patch = useTodoPatch(task);
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), task.board_key);

  const inert = canEditTodos ? undefined : "pointer-events-none";

  return (
    <div role="row" className={cn(TASK_GRID, TABLE_ROW, "group h-11")}>
      <div role="cell" className="min-w-0">
        {key !== null ? (
          <button
            type="button"
            onClick={() => openTask(task.id)}
            title={`Open ${key}`}
            className="text-ink-3 hover:text-brand focus-visible:ring-brand text-mini block truncate rounded font-medium tabular-nums transition-colors outline-none focus-visible:ring-2"
          >
            {key}
          </button>
        ) : (
          <span className="text-ink-3/50 text-mini">—</span>
        )}
      </div>

      <div role="cell" className="min-w-0">
        <button
          type="button"
          onClick={() => openTask(task.id)}
          title={task.title ?? undefined}
          className="text-ink hover:text-brand focus-visible:ring-brand text-meta block w-full truncate rounded text-left font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {task.title || <span className="text-ink-3">Untitled</span>}
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
      <div
        role="group"
        aria-label="Add a new or an existing task"
        className={cn(SEGMENTED, "mb-2 w-fit")}
      >
        {(
          [
            ["new", "New task"],
            ["existing", "Existing task"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
            className={cn(
              SEGMENT,
              mode === key ? SEGMENT_ACTIVE : SEGMENT_IDLE,
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "new" ? (
        <NewEpicTaskRow epic={epic} onDone={onDone} />
      ) : (
        <ExistingTaskPicker epic={epic} onDone={onDone} />
      )}
    </div>
  );
}

// Goes through useAddTodo, not useAddSubtask — a Task under an Epic is a real board card, unlike a Subtask.
function NewEpicTaskRow({ epic, onDone }: { epic: Todo; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const { data: columns = [] } = useColumns();
  const add = useAddTodo();

  const value = title.trim();

  // board's first column by rank — an Epic has no column of its own to inherit
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
        className={cn(
          TEXT_FIELD,
          "rounded-control h-8 min-w-0 flex-1 px-2.5 text-sm",
        )}
      />

      <button
        type="button"
        onMouseDown={onDone}
        className={cn(INLINE_ACTION, "py-1 text-xs")}
      >
        Done
      </button>
    </div>
  );
}

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
    <div
      className="border-hairline bg-surface rounded-card max-h-48 overflow-y-auto border p-1"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        onDone();
      }}
    >
      {candidates.length === 0 ? (
        <p className="text-ink-3 text-meta px-2 py-2.5">
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
                  className={cn(MENU_ITEM, "min-w-0")}
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
