import type { TodoItemProps } from "../../types/data";
import { useToggleTodo } from "../../services/lib/index";
import { useDeleteTodo } from "../../services/lib/index";

import { Bug, MoreHorizontal, Trash2, User } from "lucide-react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { useUpdateTodo } from "../../services/lib/todos/useUpdateTodo";
import { Pencil } from "lucide-react";

import TodoMenu from "./TodoItem/todoMenu";

export default function TodoItem({
  openMenu,
  closeMenu,
  menuOpen,
  overlay = false,
  ...todo
}: TodoItemProps) {
  //menu

  //edit
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

  // saving edit
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
console.log("TodoItem", todo.id, menuOpen);
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(!overlay ? attributes : {})}
      {...(!overlay ? listeners : {})}
      className={`group relative flex flex-col gap-4 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md active:cursor-grabbing ${isDragging && !overlay ? "opacity-0" : ""} `}
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
        {!editing && (
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
              
              <TodoMenu
                menuOpen={menuOpen}
                openMenu={openMenu}
                closeMenu={closeMenu}
                onEdit={() => setEditing(true)}
                todoId={todo.id}
                currentStatus={todo.status}
              />
            )}
          </div>
    
        )}
      </div>

      {/* META */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* bug */}
          <Bug size={18} className="text-red-400" />

          {/* issue key */}
          <span className="text-sm font-medium text-gray-600">
            KAN-{todo.id}
          </span>
        </div>

        {/* //MENU */}

        {/* assignee */}
        <div className="flex size-8 items-center justify-center rounded-full bg-gray-200 text-gray-600">
          <User size={17} />
        </div>
      </div>
    </div>
  );
}

{
  /* <Checkbox
        className={`border-clr-completed size-6 shrink-0 cursor-pointer rounded-full border ${completed ? "bg-gradient-to-br from-blue-500 to-purple-500" : ""} `}
        checked={completed}
        onClick={() => {
          toggleTodoMutation.mutate(todo);
        }}
      /> */
}
