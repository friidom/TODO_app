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

/**
 * One work item as a line in an issue list.
 *
 * Every cell is the control the card already uses — the list is a second
 * *layout*, not a second implementation. `StatusControl` is the clearest case:
 * it was written for a card, never imported, and turns out to be exactly what a
 * status column wants, still writing through `useMoveTodo` and so still ringing
 * a card that lands in a done column.
 *
 * **Three things are visible from across the room, and four are not.** The row
 * used to give every field the same treatment: seven bordered, filled, labelled
 * objects in a line, each looking like a control in its own right, so nothing in
 * it was louder than anything else and the summary — the only part anyone reads
 * to find an item — was the fourth thing the eye landed on. Now the type is a
 * bare coloured glyph, the key is muted 11px, the summary is the only 14px text
 * on the line, and status/priority/assignee/due sit to the right at a weight
 * meant to be *checked* rather than read. `bare` on three of those controls is
 * what took the badges off; nothing about what they do changed.
 *
 * **An empty field renders nothing (M18).** Priority, assignee and due are all
 * nullable and all common — on a board nobody has prioritised, `alwaysVisible`
 * put a grey signal glyph, a grey person glyph and a grey calendar glyph on
 * every single row, three columns of identical marks that looked like data and
 * carried none. They now fade in on row hover, which is the bargain
 * `AssigneeControl` and `DueDateControl` were already written for and
 * `PriorityControl` has just been given. The controls stay in flow at
 * `opacity-0`, so nothing about the row's geometry depends on what it holds.
 *
 * Editing the summary is the card's inline rename, in place: the same
 * Enter-saves / Escape-cancels / blur-saves / empty-reverts behaviour, through
 * the same `useTodoPatch`.
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
    <div
      role="row"
      className={cn(
        LIST_GRID,
        // 44px, fixed rather than a minimum: the row is a line in a list and
        // every one of them should be the same line. Colour is the only thing
        // hover changes — no border width, no padding, no transform — so a row
        // cannot shift or nudge its neighbours under the cursor.
        //
        // `bg-ink/[0.035]` rather than a surface token because it is the same
        // gesture in both themes: ink lifts a dark row and settles a light one,
        // where a fixed colour would have to be chosen twice.
        "border-hairline group hover:bg-ink/[0.035] h-11 border-b transition-colors duration-150",
        celebrate && "done-flash",
      )}
    >
      {/* TYPE — a coloured glyph and nothing else. It is the first thing in the
          row and the least of it: the colour says Bug or Story at a glance, and
          anyone who needs the word has the tooltip and the aria-label. */}
      <div role="cell" className={cn("flex", inert)}>
        <WorkTypeControl
          bare
          value={todo.type}
          onChange={(type) => patch({ type })}
        />
      </div>

      {/* KEY — null while the insert is in flight, because the server allocates
          it and that absence is the pending state. Opening is deliberately not
          gated: reading a task is not editing it, and the menu at the end of the
          row is editor-only. Same affordance the card's key carries.

          `tabular-nums` so KAN-9 and KAN-12 line up down the column rather than
          wandering with the width of each digit. */}
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

      {/* TITLE — the one thing in the row at reading weight, and the only track
          that grows. `min-w-0` is what lets it truncate: a grid item defaults to
          `min-width: auto` and would refuse to shrink below its own text, so a
          long summary would push the metadata off the end of the row. */}
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
          // Plain text rather than an inert button: the summary is the one cell
          // whose control is nothing but the edit affordance, so for a viewer
          // there is no chip to preserve — only the words.
          <span
            title={todo.title ?? undefined}
            className="text-ink text-meta block w-full truncate font-medium"
          >
            {todo.title || <span className="text-ink-3/60">Untitled</span>}
          </span>
        )}
      </div>

      {/* METADATA — four fixed tracks, so the four of them line up down the list
          whatever any one row happens to hold, and the eye can check a column
          without reading it. */}
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

      {/* The track is declared whether or not a menu goes in it, so the row
          keeps its columns against the header for a viewer too. The menu fades
          in place — it is in flow at `opacity-0`, so nothing reflows on hover. */}
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
