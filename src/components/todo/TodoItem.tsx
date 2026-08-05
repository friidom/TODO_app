import type { TodoItemProps } from "../../types/data";

import { Bug, Pencil, User } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";

import { useUpdateTodo } from "../../services/lib/todos/useUpdateTodo";
import TodoMenu from "./TodoItem/TodoMenu";
import LoadingSpinner from "../pages/loading/LoadingSpinner";
import { cn } from "@/services/lib/utils";
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
export default function TodoItem({ overlay = false, ...props }: TodoItemProps) {
  if (overlay) return <TodoCard {...props} overlay />;

  return <DraggableTodo {...props} />;
}

function DraggableTodo(props: TodoItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.id,
    data: { type: "todo", columnId: props.column_id },
  });

  // No transform is applied on purpose: the card stays exactly where it is and
  // only the DragOverlay follows the cursor.
  return (
    <TodoCard
      {...props}
      dragging={isDragging}
      setNodeRef={setNodeRef}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

function TodoCard({
  overlay = false,
  dragging = false,
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
  const updateTodo = useUpdateTodo();

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

    updateTodo.mutate(
      {
        ...todo,
        title,
      },
      {
        onSuccess: () => setEditing(false),
      },
    );
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
        "group relative flex touch-none flex-col gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm transition-colors duration-200 select-none hover:border-gray-300",
        overlay
          ? "cursor-grabbing opacity-60 shadow-lg"
          : "cursor-grab hover:shadow-md",
        dragging && "opacity-40 shadow-none hover:border-gray-200",
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
              className="w-full rounded-md border px-2 py-1 outline-none"
            />
          ) : (
            <p className="text-sm break-words text-gray-800">{todo.title}</p>
          )}
        </div>

        {/* actions */}
        {!todo.isOptimistic && !editing && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {/* edit */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setEditing(true)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil size={15} />
            </button>

            {!overlay && (
              <TodoMenu todoId={todo.id} columnId={todo.column_id} />
            )}
          </div>
        )}
        {todo.isOptimistic && <LoadingSpinner size="md" />}
      </div>

      {/* META */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* bug */}
          <Bug size={18} className="text-red-400" />

          {/* issue key */}
          <span className="text-sm font-medium text-gray-600">
            {!todo.isOptimistic && `KAN-${todo.id}`}
          </span>
        </div>

        {/* assignee */}
        {!todo.isOptimistic && (
          <div className="flex size-8 items-center justify-center rounded-full bg-gray-200 text-gray-600">
            <User size={17} />
          </div>
        )}
      </div>
    </div>
  );
}
