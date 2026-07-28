import type { ISupabaseTodo, TodoItemProps } from "../../types/data";
import { useToggleTodo } from "../../services/lib/index";
import { useDeleteTodo } from "../../services/lib/index";
import { Checkbox } from "../ui/checkbox";
import { Trash2 } from "lucide-react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { useUpdateTodo } from "../../services/lib/todos/useUpdateTodo";
import { Pencil } from "lucide-react";

export default function TodoItem({ overlay = false, ...todo }: TodoItemProps) {
  const toggleTodoMutation = useToggleTodo();
  const deleteTodoMutation = useDeleteTodo();
  const { completed } = todo;

  //edit todo
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateTodo = useUpdateTodo();

  //focus on edit
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  //saving edit
  function saveTodo() {
    if (title.trim() === "") {
      setTitle(todo.title);
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
    setTitle(todo.title);
    setEditing(false);
  }

  const animateLayoutChanges = (args: any) => {
    if (args.isSorting || args.wasDragging) {
      return false;
    }

    return defaultAnimateLayoutChanges(args);
  };

  const sortable = !overlay
    ? useSortable({
        id: todo.id,
        animateLayoutChanges,
        data: {
          status: todo.status,
        },
      })
    : null;

  const isDragging = sortable?.isDragging ?? false;
  const attributes = sortable?.attributes ?? {};
  const listeners = sortable?.listeners ?? {};
  const setNodeRef = sortable?.setNodeRef ?? (() => {});
  const transform = sortable?.transform;
  const transition = sortable?.transition;

  const style = overlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform ?? null),
        transition,
        willChange: "transform",
      };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      className={`group bg-card border-app flex items-center justify-between gap-3 overflow-hidden rounded-2xl border px-4 py-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-500/60 hover:shadow-xl hover:ring-1 hover:ring-violet-500/60 ${
        isDragging && !overlay ? `opacity-0` : ""
      } `}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-400 transition hover:text-gray-700 active:cursor-grabbing"
      >
        {" "}
        <GripVertical size={18} />
      </button>

      <Checkbox
        className={`border-clr-completed size-6 shrink-0 cursor-pointer rounded-full border ${completed ? "bg-gradient-to-br from-blue-500 to-purple-500" : ""} `}
        checked={completed}
        onClick={() => {
          toggleTodoMutation.mutate(todo);
        }}
      />

      <div
        className={`min-w-0 flex-1 text-sm font-medium ${completed ? "text-gray-500 line-through" : "text-main"} `}
      >
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
            className="w-full rounded border border-violet-300 px-2 py-1 transition-all duration-200 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500"
          />
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            className="group/title ml-1 flex cursor-text items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-violet-100 dark:hover:bg-violet-300"
          >
            <span className="flex-1 wrap-break-word">{todo.title}</span>

            <Pencil
              size={14}
              className="translate-x-1 text-gray-400 opacity-0 transition-all duration-200 group-hover/title:translate-x-0 group-hover/title:opacity-100 hover:text-blue-500"
            />
          </div>
        )}
      </div>

      {/* //delete  */}
      <button
        className="flex size-8 items-center justify-center rounded-full transition"
        aria-label="Delete Todo"
        type="button"
        onClick={() => {
          deleteTodoMutation.mutate(todo.id);
        }}
      >
        <p className="sr-only">Delete</p>
        <Trash2
          size={18}
          className="text-gray-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
        />
      </button>
    </div>
  );
}
