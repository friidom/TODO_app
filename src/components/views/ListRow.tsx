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
import { toPriority } from "@/constants/priorities";
import type { Todo } from "@/types/data";
import { useDoneFlash } from "@/stores/doneFlash";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

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
  const { openTask } = useOpenTask();
  const key = taskKey(useKeyPrefix(), todo.board_key);

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
        // Colour only on hover — no border width, no padding, no transform, so
        // a row cannot shift under the cursor.
        "border-hairline group hover:bg-elevated/60 border-b transition-colors duration-150",
        celebrate && "done-flash",
      )}
    >
      {/* IDENTITY — the type and the key answer "which item" together, so they
          are one cell rather than two columns each saying half of it. */}
      <td className="py-2 pl-3">
        <div className="flex items-center gap-2">
          <span className={cn("shrink-0", inert)}>
            <WorkTypeControl
              value={todo.type}
              onChange={(type) => patch({ type })}
            />
          </span>

          {/* Null while the insert is in flight — the server allocates the key,
              and that absence is the pending state. Opening is deliberately not
              gated: reading a task is not editing it, and the menu at the end of
              the row is editor-only. Same affordance the card's key carries. */}
          {key !== null ? (
            <button
              type="button"
              onClick={() => openTask(todo.id)}
              title={`Open ${key}`}
              className="text-ink-3 hover:text-brand focus-visible:ring-brand rounded text-[11px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2"
            >
              {key}
            </button>
          ) : (
            <span className="text-ink-3/50 text-[11px]">—</span>
          )}
        </div>
      </td>

      {/* TITLE — the dominant column, and the only elastic one. `max-w-0` is
          what makes truncation work: without it an auto-layout column grows to
          fit its content, so a long title widened the table and pushed the page
          into horizontal scroll instead of ellipsising. */}
      <td className="max-w-0 py-2 pr-3">
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
            className="text-ink hover:text-brand focus-visible:ring-brand block w-full truncate rounded text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2"
          >
            {todo.title || <span className="text-ink-3/60">Untitled</span>}
          </button>
        ) : (
          // Plain text rather than an inert button: the summary is the one cell
          // whose control is nothing but the edit affordance, so for a viewer
          // there is no chip to preserve — only the words.
          <span
            title={todo.title ?? undefined}
            className="text-ink block w-full truncate text-sm font-medium"
          >
            {todo.title || <span className="text-ink-3/60">Untitled</span>}
          </span>
        )}
      </td>

      <td className={cn("py-2 pr-3", inert)}>
        <StatusControl todoId={todo.id} columnId={todo.column_id} />
      </td>

      <td className={cn("hidden py-2 pr-3 lg:table-cell", inert)}>
        <PriorityControl
          value={todo.priority}
          onChange={(priority) => patch({ priority })}
          showLabel={toPriority(todo.priority) !== null}
        />
      </td>

      <td className={cn("py-2 pr-3", inert)}>
        <AssigneeControl
          boardId={todo.board_id}
          value={todo.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
          alwaysVisible
        />
      </td>

      <td className={cn("hidden py-2 pr-3 lg:table-cell", inert)}>
        <DueDateControl
          value={todo.due_date}
          onChange={(due_date) => patch({ due_date })}
          alwaysVisible
        />
      </td>

      <td className="py-2 pr-3">
        {/* The cell stays whether or not it holds a menu, so the row keeps its
            column count against the header. The menu inside it fades in place —
            it is in flow at `opacity-0`, so nothing reflows on hover. */}
        {canEditTodos && (
          <div className="flex justify-end opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
            <TodoMenu todo={todo} onEdit={() => setEditing(true)} />
          </div>
        )}
      </td>
    </tr>
  );
}
