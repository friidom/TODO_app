import type { IServiceTodo, ISupabaseTodo } from "../../types/data";
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

export default function TodoItem(todo: ISupabaseTodo) {
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
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: todo.id,
      animateLayoutChanges,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    willChange: "transform",
  };
  return (
    <div
      ref={setNodeRef}

      style={style}
      className=" draggable-true  group flex snap-start items-center justify-between gap-2 border-b  border-clr-todo-borders py-4 pl-2 pr-5 "
    >
      <button {...attributes} {...listeners} className="cursor-grab">
        <GripVertical size={18} />
      </button>

      <Checkbox
        className={`size-6 shrink-0 border-red cursor-pointer rounded-full border-clr-completed text-black ${completed ? "bg-gradient-to-br from-red-500 via-white-400 to-blue-300" : ""}`}
        checked={completed}
        onClick={() => {
          toggleTodoMutation.mutate(todo);
        }}
      />

      <div
        className={`line-clamp-1 min-w-0 flex-1 group-hover:line-clamp-none group-focus:line-clamp-none group-focus-visible:line-clamp-none ${completed ? " text-gray-500 line-through decoration-2" : "text-clr-todo-text"}`}
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
            className="
      w-full
      rounded
      border
      border-violet-300
      px-2
      py-1
      outline-none
      transition-all
      duration-200
      focus:border-violet-500
      focus:ring-2
      focus:ring-violet-500
    "
          />
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            className="
      group/title
      flex
      items-center
      gap-2
      cursor-text
      rounded-md
      px-1
      py-1
      transition-colors
      hover:bg-gray-100
    "
          >
            <span className="flex-1 break-words">{todo.title}</span>

            <Pencil
              size={14}
              className="
        translate-x-1
        opacity-0
        text-gray-400
        transition-all
        duration-200
        group-hover/title:translate-x-0
        group-hover/title:opacity-100
      "
            />
          </div>
        )}
      </div>
      <button
        className="flex size-6 shrink-0  cursor-pointer items-center justify-center rounded-full"
        aria-label="Delete Todo"
        type="button"
        onClick={() => {
          deleteTodoMutation.mutate(todo.id);
        }}
      >
        <p className="sr-only">Delete</p>
        <Trash2
          className="
    text-clr-todo-placeholder
    opacity-0
    transition-all
    duration-200
    group-hover:opacity-100
    hover:text-red-500
  "
        />
      </button>
    </div>
  );
}
