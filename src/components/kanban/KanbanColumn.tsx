import { useDroppable } from "@dnd-kit/core";
import TodoItem from "../todo/TodoItem";

import type { IColumn, ISupabaseTodo } from "../../types/data";
import { Plus } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { useAddTodo } from "../../services/lib";
import { Bug, Calendar, ChevronDown, CornerDownLeft, User } from "lucide-react";
import DropZone from "./DropZone";
import type { TodoIndicator } from "@/hooks/useKanbanDnd";

interface Props {
  headerTitle: string;
  id: string;
  todos: ISupabaseTodo[];
  column: IColumn;
  openMenuId: number | null;
  setOpenMenuId: React.Dispatch<React.SetStateAction<number | null>>;
  indicator: TodoIndicator;
  dragHandleProps?: Record<string, unknown>;
}

export default function KanbanColumn({
  id,
  headerTitle,
  openMenuId,
  setOpenMenuId,
  todos,
  column,
  indicator,
  dragHandleProps,
}: Props) {
  const { setNodeRef } = useDroppable({
    id,
    data: { type: "column", columnId: id },
  });

  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");

  const addTodoMutation = useAddTodo();
  const formRef = useRef<HTMLFormElement>(null);

  function onClose() {
    setIsCreating(false);
    setTitle("");
  }

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;

      if (!formRef.current?.contains(target)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [onClose]);

  useEffect(() => {
    if (!isCreating) return;

    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [todos.length, isCreating]);

  const handleAddTodo = (e?: React.SyntheticEvent) => {
    e?.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) return;

    addTodoMutation.mutate({
      title: trimmedTitle,
      column_id: id,
    });
    //clean input for the next title
    setTitle("");
    setIsCreating(true);
  };
  //ref scroll
  const listRef = useRef<HTMLDivElement>(null);

  const isIndicatorHere = indicator?.columnId === id;

  return (
    <div
      ref={setNodeRef}
      className="flex h-fit max-h-[calc(100vh-220px)] w-[280px] shrink-0 flex-col overflow-hidden rounded-xl bg-[#f8f8f8]"
    >
      {/* HEADER — the only drag handle for the column */}
      <div
        {...dragHandleProps}
        className="flex shrink-0 cursor-grab touch-none items-center justify-between px-5 py-4 select-none active:cursor-grabbing"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-700">{headerTitle}</h2>

          <span className="rounded-md bg-gray-200 px-2 py-0.5 text-sm font-semibold text-gray-600">
            {todos.length}
          </span>
        </div>
      </div>

      {/* TODO LIST */}
      <div ref={listRef} className="min-h-0 overflow-y-auto px-3 pb-2">
        <div className="flex min-h-10 flex-col">
          <DropZone
            columnId={id}
            index={0}
            active={isIndicatorHere && indicator.index === 0}
            afterId={todos[0]?.id}
          />

          {todos.map((todo, index) => (
            <React.Fragment key={todo.id}>
              <TodoItem
                menuOpen={openMenuId === todo.id}
                openMenu={() => setOpenMenuId(todo.id)}
                closeMenu={() => setOpenMenuId(null)}
                {...todo}
              />
              <DropZone
                columnId={id}
                index={index + 1}
                active={isIndicatorHere && indicator.index === index + 1}
                beforeId={todo.id}
                afterId={todos[index + 1]?.id}
              />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* CREATE */}
      <div className="shrink-0 bg-[#f8f8f8] p-2">
        {!isCreating ? (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-200"
          >
            <Plus size={20} />
            Create
          </button>
        ) : (
          <div className="rounded-xl border-2 border-blue-500 bg-white px-3 py-2 shadow-sm">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTodo();
                }

                if (e.key === "Escape") {
                  setTitle("");
                  setIsCreating(false);
                }
              }}
              className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
            />

            <div className="mt-8 flex items-center gap-1">
              <button
                type="button"
                className="rounded-md p-1 text-red-400 hover:bg-gray-100"
              >
                <Bug size={19} />
              </button>

              <button
                type="button"
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
              >
                <ChevronDown size={16} />
              </button>

              <button
                type="button"
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
              >
                <Calendar size={19} />
              </button>

              <button
                type="button"
                className="rounded-full bg-gray-200 p-1 text-gray-500 hover:bg-gray-300"
              >
                <User size={17} />
              </button>

              <button
                type="button"
                disabled={!title.trim()}
                onClick={handleAddTodo}
                className="ml-auto flex size-7 items-center justify-center rounded-md bg-gray-100 text-gray-400 hover:bg-gray-200 disabled:opacity-40"
              >
                <CornerDownLeft size={17} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
