import { useEffect, useRef, useState } from "react";

import AssigneeControl from "@/components/todo/TodoItem/AssigneeControl";
import DueDateControl from "@/components/todo/TodoItem/DueDateControl";
import PriorityControl from "@/components/todo/TodoItem/PriorityControl";
import StatusControl from "@/components/todo/TodoItem/StatusControl";
import TodoMenu from "@/components/todo/TodoItem/TodoMenu";
import WorkTypeControl from "@/components/todo/TodoItem/WorkTypeControl";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import type { Todo } from "@/types/data";
import { useDoneFlash } from "@/stores/doneFlash";
import { cn } from "@/utils/cn";

/**
 * One work item as a table row.
 *
 * Every cell is the control the card already uses, in its own chip form — the
 * list is a second *layout*, not a second implementation. `StatusControl` is the
 * clearest case: it was written for a card, never imported, and turns out to be
 * exactly what a status column wants, still writing through `useMoveTodo` and so
 * still ringing a card that lands in a done column.
 *
 * Editing the summary is the card's inline rename, cell-shaped: the same
 * Enter-saves / Escape-cancels / blur-saves / empty-reverts behaviour, through
 * the same `useTodoPatch`. There is no detail view to open yet (M5-06), so this
 * is the whole edit flow rather than a stand-in for one.
 */
export default function ListRow({ todo }: { todo: Todo }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useTodoPatch(todo);

  const { canEditTodos } = usePermissions();

  const celebrate = useDoneFlash((state) => state.todoId === todo.id);

  /**
   * Read-only cells for a viewer.
   *
   * `pointer-events-none` rather than five presentational twins of controls
   * that already exist: it keeps the row looking exactly as it does for
   * everyone else — same chips, same spacing, same colours — while making them
   * inert. A viewer clicking a status chip that opens a menu and then silently
   * fails is the case the plan warns reads as a broken board.
   */
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
    <tr
      className={cn(
        "border-hairline hover:bg-elevated group border-b transition-colors",
        celebrate && "done-flash",
      )}
    >
      <td className={cn("hidden py-1.5 pr-2 pl-3 sm:table-cell", inert)}>
        <WorkTypeControl
          value={todo.type}
          onChange={(type) => patch({ type })}
        />
      </td>

      <td className="hidden py-1.5 pr-2 sm:table-cell">
        {/* Null while the insert is in flight — the server allocates the key,
            and that absence is the pending state. */}
        {todo.board_key !== null && (
          <span className="text-ink-3 text-xs font-semibold whitespace-nowrap">
            KAN-{todo.board_key}
          </span>
        )}
      </td>

      <td className="w-full py-1.5 pr-2 pl-3 sm:pl-0">
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
            className="border-brand bg-surface text-ink rounded-control w-full border-2 px-2 py-0.5 text-sm outline-none"
          />
        ) : canEditTodos ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-ink hover:text-brand block w-full truncate text-left text-sm transition-colors"
          >
            {todo.title}
          </button>
        ) : (
          // Plain text rather than an inert button: the summary is the one cell
          // whose control is nothing but the edit affordance, so for a viewer
          // there is no chip to preserve — only the words.
          <span className="text-ink block w-full truncate text-sm">
            {todo.title}
          </span>
        )}
      </td>

      <td className={cn("py-1.5 pr-2", inert)}>
        <StatusControl todoId={todo.id} columnId={todo.column_id} />
      </td>

      <td className={cn("hidden py-1.5 pr-2 lg:table-cell", inert)}>
        <PriorityControl
          value={todo.priority}
          onChange={(priority) => patch({ priority })}
          showLabel
        />
      </td>

      <td className={cn("py-1.5 pr-2", inert)}>
        <AssigneeControl
          boardId={todo.board_id}
          value={todo.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
          alwaysVisible
        />
      </td>

      <td className={cn("hidden py-1.5 pr-2 lg:table-cell", inert)}>
        <DueDateControl
          value={todo.due_date}
          onChange={(due_date) => patch({ due_date })}
          alwaysVisible
        />
      </td>

      <td className="py-1.5 pr-3">
        {/* The cell stays so the row keeps its column count against the
            header; only the menu inside it goes. */}
        {canEditTodos && (
          <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <TodoMenu todo={todo} onEdit={() => setEditing(true)} />
          </div>
        )}
      </td>
    </tr>
  );
}
