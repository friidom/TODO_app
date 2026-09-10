import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ListTreeIcon,
  PlusIcon,
} from "lucide-react";

import AssigneeControl from "./TodoItem/AssigneeControl";
import PriorityControl from "./TodoItem/PriorityControl";
import StatusControl from "./TodoItem/StatusControl";
import { Skeleton } from "@/components/ui/skeleton";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { useAddSubtask } from "@/services/todos/useAddSubtask";
import { useSubtasks } from "@/services/todos/useSubtasks";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

const SUBTASK_GRID =
  "grid items-center gap-x-2 px-3 grid-cols-[3.75rem_minmax(0,1fr)_1.5rem_1.5rem_7.5rem]";

export default function SubtasksSection({ todo }: { todo: Todo }) {
  const { subtasks, progress, isPending } = useSubtasks(todo.id);
  const { canEditTodos } = usePermissions();

  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} subtasks`}
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
          Subtasks
        </h3>

        {/* stays visible when collapsed — closing the section shouldn't hide the count */}
        {progress.total > 0 && (
          <span className="bg-ink/10 text-ink-3 text-mini shrink-0 rounded px-1.5 py-0.5 font-semibold tabular-nums">
            {progress.done}/{progress.total}
          </span>
        )}

        {canEditTodos && (
          <button
            type="button"
            onClick={() => {
              setCollapsed(false);
              setAdding(true);
            }}
            aria-label="Add subtask"
            title="Add subtask"
            className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand ml-auto grid size-6 shrink-0 place-items-center rounded transition-colors outline-none focus-visible:ring-2"
          >
            <PlusIcon className="size-4" />
          </button>
        )}
      </div>

      {progress.total > 0 && (
        <div
          className="bg-ink/[0.06] mb-3 h-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={progress.done}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label={`${progress.done} of ${progress.total} subtasks done`}
        >
          <div
            style={{ width: `${progress.percent}%` }}
            className="bg-status-green h-full rounded-full transition-[width] duration-300"
          />
        </div>
      )}

      {!collapsed && (
        <>
          {isPending ? (
            <div className="space-y-2" aria-busy>
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : subtasks.length === 0 && !adding ? (
            <div className="text-ink-3 flex items-center gap-2 py-1 text-sm">
              <ListTreeIcon className="size-4 shrink-0" />
              <span>
                No subtasks yet.
                {canEditTodos && " Break this task down with the + above."}
              </span>
            </div>
          ) : (
            subtasks.length > 0 && (
              <div
                role="table"
                aria-label="Subtasks"
                className="border-hairline rounded-card overflow-hidden border"
              >
                <div
                  role="row"
                  className={cn(
                    SUBTASK_GRID,
                    "border-hairline text-ink-3/70 text-micro bg-surface/40 h-8 border-b font-medium tracking-[0.08em] uppercase",
                  )}
                >
                  <span role="columnheader">Work</span>
                  <span role="columnheader">
                    {/* sr-only on the span, not the grid item, or it'd drop out of the grid */}
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

                {subtasks.map((subtask) => (
                  <SubtaskRow key={subtask.id} subtask={subtask} />
                ))}
              </div>
            )
          )}

          {adding && (
            <AddSubtaskRow
              parent={todo}
              onDone={() => setAdding(false)}
              hasRows={subtasks.length > 0}
            />
          )}
        </>
      )}
    </section>
  );
}

function SubtaskRow({ subtask }: { subtask: Todo }) {
  const { openTask } = useOpenTask();
  const patch = useTodoPatch(subtask);
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), subtask.board_key);

  // viewers get inert controls, not hidden ones, so the table looks the same for everyone
  const inert = canEditTodos ? undefined : "pointer-events-none";

  return (
    <div
      role="row"
      className={cn(
        SUBTASK_GRID,
        "border-hairline group hover:bg-ink/[0.035] h-11 border-b transition-colors duration-150 last:border-b-0",
      )}
    >
      <div role="cell" className="min-w-0">
        {key !== null ? (
          <button
            type="button"
            onClick={() => openTask(subtask.id)}
            title={`Open ${key}`}
            className="text-ink-3/80 hover:text-brand focus-visible:ring-brand text-mini block truncate rounded font-medium tabular-nums transition-colors outline-none focus-visible:ring-2"
          >
            {key}
          </button>
        ) : (
          // no key yet means the create is still in flight
          <span className="text-ink-3/40 text-mini">—</span>
        )}
      </div>

      <div role="cell" className="min-w-0">
        <button
          type="button"
          onClick={() => openTask(subtask.id)}
          title={subtask.title ?? undefined}
          className="text-ink hover:text-brand focus-visible:ring-brand text-meta block w-full truncate rounded text-left font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {subtask.title || <span className="text-ink-3/60">Untitled</span>}
        </button>
      </div>

      <div role="cell" className={cn("flex", inert)}>
        <PriorityControl
          bare
          value={subtask.priority}
          onChange={(priority) => patch({ priority })}
        />
      </div>

      <div role="cell" className={cn("flex", inert)}>
        <AssigneeControl
          boardId={subtask.board_id}
          value={subtask.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
        />
      </div>

      <div role="cell" className={cn("flex min-w-0", inert)}>
        <StatusControl todoId={subtask.id} columnId={subtask.column_id} />
      </div>
    </div>
  );
}
function AddSubtaskRow({
  parent,
  onDone,
  hasRows,
}: {
  parent: Todo;
  onDone: () => void;
  hasRows: boolean;
}) {
  const [title, setTitle] = useState("");
  const add = useAddSubtask();

  const value = title.trim();

  function submit() {
    if (value === "") {
      onDone();
      return;
    }

    // no column on the parent means no status to inherit — shouldn't happen outside a create in flight
    if (!parent.column_id) return;

    add.mutate({
      title: value,
      parentId: parent.id,
      columnId: parent.column_id,
    });

    setTitle("");
  }

  return (
    <div className={cn("flex items-center gap-2", hasRows ? "mt-2" : "mt-0")}>
      <input
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();

          if (event.key === "Escape") {
            // stop it bubbling to the modal's Escape handler, or this closes the task too
            event.preventDefault();
            onDone();
          }
        }}
        onBlur={submit}
        placeholder="What needs doing?"
        aria-label="Subtask title"
        className="border-hairline text-ink placeholder:text-ink-3 focus:border-brand/60 focus:ring-brand/25 rounded-control min-w-0 flex-1 border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-2"
      />

      <button
        type="button"
        // mousedown, not click — the input's onBlur fires first and unmounts this button
        onMouseDown={onDone}
        className="text-ink-3 hover:text-ink rounded-control shrink-0 px-2 py-1 text-xs font-medium"
      >
        Done
      </button>
    </div>
  );
}
