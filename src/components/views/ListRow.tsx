import { useEffect, useRef, useState } from "react";

import AssigneeControl from "@/components/todo/TodoItem/AssigneeControl";
import DueDateControl from "@/components/todo/TodoItem/DueDateControl";
import PriorityControl from "@/components/todo/TodoItem/PriorityControl";
import StatusControl from "@/components/todo/TodoItem/StatusControl";
import TodoMenu from "@/components/todo/TodoItem/TodoMenu";
import WorkTypeControl from "@/components/todo/TodoItem/WorkTypeControl";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import type { Todo } from "@/types/data";
import { useDoneFlash } from "@/stores/doneFlash";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";
import { LIST_GRID } from "./listGrid";

export default function ListRow({ todo }: { todo: Todo }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useTodoPatch(todo);

  const { canEditTodos } = usePermissions();
  const { openTask } = useOpenTask();
  const key = taskKey(useKeyPrefix(), todo.board_key);

  const celebrate = useDoneFlash((state) => state.todoId === todo.id);

  // pointer-events-none rather than read-only twins of every control — same look, just inert
  const inert = canEditTodos ? undefined : "pointer-events-none";

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function save() {
    if (title.trim() === "" || title === todo.title) {
      setTitle(todo.title ?? "");
      setEditing(false);
      return;
    }

    patch({ title }, { onSuccess: () => setEditing(false) });
  }

  function cancel() {
    setTitle(todo.title ?? "");
    setEditing(false);
  }

  return (
    <div
      role="row"
      className={cn(
        LIST_GRID,
        "border-hairline group hover:bg-ink/[0.035] h-11 border-b transition-colors duration-150",
        celebrate && "done-flash",
      )}
    >
      <div role="cell" className={cn("flex", inert)}>
        <WorkTypeControl
          bare
          value={todo.type}
          onChange={(type) => patch({ type })}
        />
      </div>

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

      <div role="cell" className="min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") cancel();
            }}
            className="border-brand bg-surface text-ink rounded-control w-full border px-2 py-0.5 text-sm outline-none"
          />
        ) : canEditTodos ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title={todo.title ?? undefined}
            className="text-ink hover:text-brand focus-visible:ring-brand text-meta block w-full truncate rounded text-left font-medium transition-colors outline-none focus-visible:ring-2"
          >
            {todo.title || <span className="text-ink-3/60">Untitled</span>}
          </button>
        ) : (
          <span
            title={todo.title ?? undefined}
            className="text-ink text-meta block w-full truncate font-medium"
          >
            {todo.title || <span className="text-ink-3/60">Untitled</span>}
          </span>
        )}
      </div>

      <div role="cell" className={cn("flex min-w-0", inert)}>
        <StatusControl todoId={todo.id} columnId={todo.column_id} />
      </div>

      <div role="cell" className={cn("hidden lg:flex", inert)}>
        <PriorityControl
          bare
          value={todo.priority}
          onChange={(priority) => patch({ priority })}
        />
      </div>

      <div role="cell" className={cn("flex", inert)}>
        <AssigneeControl
          boardId={todo.board_id}
          value={todo.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
        />
      </div>

      <div
        role="cell"
        className={cn("hidden justify-end whitespace-nowrap lg:flex", inert)}
      >
        <DueDateControl
          bare
          value={todo.due_date}
          onChange={(due_date) => patch({ due_date })}
        />
      </div>

      <div role="cell" className="flex justify-end">
        {canEditTodos && (
          <div className="coarse:opacity-100 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
            <TodoMenu todo={todo} onEdit={() => setEditing(true)} />
          </div>
        )}
      </div>
    </div>
  );
}
