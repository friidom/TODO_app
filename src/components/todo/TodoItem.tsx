import type { TodoItemProps } from "../../types/data";

import { Pencil, User } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";

import { useTodoPatch } from "@/hooks/useTodoPatch";
import TodoMenu from "./TodoItem/TodoMenu";
import AssigneeControl from "./TodoItem/AssigneeControl";
import DueDateControl from "./TodoItem/DueDateControl";
import WorkTypeControl from "./TodoItem/WorkTypeControl";
import { workTypeOf } from "@/constants/workTypes";
import { cn } from "@/utils/cn";
import { useDoneFlash } from "@/stores/doneFlash";

type CardProps = TodoItemProps & {
  dragging?: boolean;
  setNodeRef?: (element: HTMLElement | null) => void;
  handleProps?: Record<string, unknown>;
};

/**
 * Split in two so hooks are never called conditionally: the overlay copy is a
 * plain card, the one in the column is wrapped in a draggable.
 */
export default function TodoItem({
  overlay = false,
  dragDisabled = false,
  ...props
}: TodoItemProps) {
  if (overlay) return <TodoCard {...props} overlay />;

  return <DraggableTodo {...props} dragDisabled={dragDisabled} />;
}

function DraggableTodo({ dragDisabled, ...props }: TodoItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.id,
    data: { type: "todo", columnId: props.column_id },
    // @dnd-kit's own switch, rather than withholding the listeners: a disabled
    // draggable is still registered, so nothing downstream has to cope with a
    // card that exists on the board but not in the drag context.
    disabled: dragDisabled,
  });

  // No transform is applied on purpose: the card stays exactly where it is and
  // only the DragOverlay follows the cursor.
  return (
    <TodoCard
      {...props}
      dragging={isDragging}
      dragDisabled={dragDisabled}
      setNodeRef={setNodeRef}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

/** The overlay's copy of the work-type chip: the same look, no popover. */
function WorkTypeBadge({ type }: { type: string | null }) {
  const meta = workTypeOf(type);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
        meta.chip,
      )}
    >
      <Icon className="size-3" />
    </span>
  );
}

function TodoCard({
  overlay = false,
  dragging = false,
  dragDisabled = false,
  setNodeRef,
  handleProps,
  ...todo
}: CardProps) {
  //edit
  const [editing, setEditing] = useState(false);
  // `todos.title` is nullable in the schema; the edit field is always a string,
  // so a null card title starts the input empty rather than as `null`.
  const [title, setTitle] = useState(todo.title ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  // One patch function for the three fields this card writes, shared with the
  // card menu and the list row so there is a single `updateTodo` call site.
  const patch = useTodoPatch(todo);

  // Only the real card rings — never the drag overlay's copy of it.
  const celebrate = useDoneFlash(
    (state) => state.todoId === todo.id && !overlay && !dragging,
  );

  //focus on edit
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // saving edit
  function saveTodo() {
    if (title.trim() === "") {
      setTitle(todo.title ?? "");
      setEditing(false);
      return;
    }

    if (title === todo.title) {
      setEditing(false);
      return;
    }

    // board_id travels with every patch: updateTodo upserts, so it needs the
    // row's board to propose a valid row when the card's own INSERT has not
    // landed yet. `useTodoPatch` is where that now happens, once.
    patch({ title }, { onSuccess: () => setEditing(false) });
  }

  //canceling edit
  function cancelEdit() {
    setTitle(todo.title ?? "");
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      {...handleProps}
      className={cn(
        "group border-hairline bg-elevated hover:border-ink/25 relative flex touch-none flex-col gap-2 rounded-card border px-2.5 py-2 shadow-sm transition-colors duration-200 select-none",
        overlay
          ? "cursor-grabbing opacity-60 shadow-lg"
          : dragDisabled
            ? "hover:shadow-md"
            : "cursor-grab hover:shadow-md",
        dragging && "opacity-40 shadow-none hover:border-hairline",
        // Mounting in a done column means the card just got there — the
        // animation is one-shot, so mounting is the whole trigger.
        celebrate && "done-flash",
      )}
    >
      {/* TITLE */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTodo}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTodo();
                if (e.key === "Escape") cancelEdit();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="border-brand bg-surface text-ink w-full rounded-control border-2 px-2 py-1 text-sm outline-none"
            />
          ) : (
            <p className="text-ink text-[13px] leading-snug break-words">{todo.title}</p>
          )}
        </div>

        {/* actions — no pending state to hide behind since M2-14: the card
            already holds its real id, so its menu and its key are valid the
            moment it appears. */}
        {!editing && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {/* edit */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setEditing(true)}
              className="rounded-md p-1 text-ink-3 hover:bg-ink/10 hover:text-ink"
            >
              <Pencil size={15} />
            </button>

            {!overlay && (
              <TodoMenu todo={todo} onEdit={() => setEditing(true)} />
            )}
          </div>
        )}
      </div>

      {/* META — work type, key, due date, then the assignee pushed right.
          Secondary to the title by design: everything here is 11px on a muted
          chip, and a control with nothing set stays invisible until the card is
          hovered, so a bare card carries no chrome.

          There is no status chip. Status is which column the card is in, and
          the column already says so above every card in it — a chip repeating
          it spent the widest part of the densest row on the board saying
          nothing. Changing status still works, through the card menu's "Change
          status".

          Wraps rather than overflowing: on a narrow column a card with a long
          due date and an avatar runs out of room, and a second line reads
          better than a clipped one. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {/* issue key — a per-board counter (M2-21), not the row id, which is
            a uuid. Allocated server-side, so it is null for the moment a
            freshly created card is still in flight: that absence is the
            pending state now that there is no isOptimistic flag.

            The work-type chip sits before it. It is icon-only here — the
            label would double the width of the densest row on the board for
            something the colour already says, and it is on the trigger's
            aria-label for anyone who needs it. */}
        {overlay ? (
          <WorkTypeBadge type={todo.type} />
        ) : (
          <WorkTypeControl
            value={todo.type}
            onChange={(type) => patch({ type })}
          />
        )}

        {todo.board_key !== null && (
          <span className="bg-ink/10 text-ink-2 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold">
            KAN-{todo.board_key}
          </span>
        )}

        {/* The controls are controlled and do not write. On a card the patch
            is this parent's job; the create form holds the same values in
            state instead. One implementation, two modes. */}
        {!overlay && (
          <DueDateControl
            value={todo.due_date}
            onChange={(due_date) => patch({ due_date })}
          />
        )}

        <div className="ml-auto flex shrink-0 items-center">
          {overlay ? (
            <span className="border-hairline text-ink-3 grid size-6 place-items-center rounded-full border border-dashed">
              <User size={12} />
            </span>
          ) : (
            <AssigneeControl
              boardId={todo.board_id}
              value={todo.assignee_id}
              onChange={(assignee_id) => patch({ assignee_id })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
