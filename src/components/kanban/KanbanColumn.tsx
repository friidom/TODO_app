import { useDroppable } from "@dnd-kit/core";
import TodoItem from "../todo/TodoItem";

import type { IColumn, ISupabaseTodo } from "../../types/data";
import { ArrowRight, Plus } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { useAddTodo } from "../../services/lib";
import DropZone from "./DropZone";
import TodoCreateForm from "./TodoCreateForm";
import { cn } from "@/services/lib/utils";
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
  /** A card is being dragged out of this column. */
  isDragSource?: boolean;
  /** This column is the drop target for a card from another column. */
  transition?: { from: string; to: string } | null;
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
  isDragSource = false,
  transition = null,
}: Props) {
  const { setNodeRef } = useDroppable({
    id,
    data: { type: "column", columnId: id },
  });

  /** Gap index the create form is open at, or `null` when it is closed. */
  const [creatingAt, setCreatingAt] = useState<number | null>(null);
  /** True only for the opening render, so the skeleton plays once. */
  const [skeleton, setSkeleton] = useState(false);
  const [title, setTitle] = useState("");

  const addTodoMutation = useAddTodo();
  const formRef = useRef<HTMLDivElement>(null);

  function openAt(gap: number) {
    setCreatingAt(gap);
    setSkeleton(true);
  }

  function onClose() {
    setCreatingAt(null);
    setSkeleton(false);
    setTitle("");
  }

  useEffect(() => {
    if (creatingAt === null) return;

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
  }, [creatingAt]);

  useEffect(() => {
    // Only the form at the bottom needs the list scrolled down to it.
    if (creatingAt !== todos.length) return;

    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [todos.length, creatingAt]);

  const handleAddTodo = () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle || creatingAt === null) return;

    addTodoMutation.mutate({
      title: trimmedTitle,
      column_id: id,
      index: creatingAt,
    });
    //clean input for the next title
    setTitle("");
    // keep creating, now below the card we just added — no skeleton this time,
    // the form is already open and the caret has to stay live
    setSkeleton(false);
    setCreatingAt(creatingAt + 1);
  };
  //ref scroll
  const listRef = useRef<HTMLDivElement>(null);

  const isIndicatorHere = indicator?.columnId === id;

  /**
   * The `+` is pointless on the last gap (the Create button below already adds
   * there) and on the gap whose form is currently open.
   */
  const addHandlerFor = (gap: number) =>
    gap < todos.length && creatingAt !== gap ? () => openAt(gap) : undefined;

  // One element, rendered at whichever gap `creatingAt` points to. Moving it
  // remounts it, which re-runs its autoFocus.
  const createForm = (
    <TodoCreateForm
      ref={formRef}
      value={title}
      onChange={setTitle}
      onSubmit={handleAddTodo}
      onCancel={onClose}
      skeleton={skeleton}
    />
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-fit max-h-[calc(100vh-220px)] w-[280px] shrink-0 flex-col overflow-hidden rounded-xl transition-colors duration-150",
        transition
          ? "bg-blue-50 ring-2 ring-blue-500 ring-inset"
          : "bg-[#f8f8f8]",
      )}
    >
      {/* HEADER — the only drag handle for the column */}
      <div
        {...dragHandleProps}
        className="flex shrink-0 cursor-grab touch-none items-center justify-between px-5 py-4 select-none active:cursor-grabbing"
      >
        {transition ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate rounded bg-gray-200 px-1.5 py-0.5 text-xs font-bold tracking-wide text-gray-700 uppercase">
              {transition.from}
            </span>

            <ArrowRight size={14} className="shrink-0 text-gray-500" />

            <span className="truncate rounded bg-blue-200 px-1.5 py-0.5 text-xs font-bold tracking-wide text-blue-900 uppercase">
              {transition.to}
            </span>
          </div>
        ) : isDragSource ? (
          <div className="w-full truncate rounded-md border-2 border-blue-500 bg-white py-1 text-center text-sm text-gray-700">
            Transition to...
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-lg font-semibold text-gray-700">
              {headerTitle}
            </h2>

            <span className="shrink-0 rounded-md bg-gray-200 px-2 py-0.5 text-sm font-semibold text-gray-600">
              {todos.length}
            </span>
          </div>
        )}
      </div>

      {/* TODO LIST */}
      <div ref={listRef} className="min-h-0 overflow-y-auto px-3 pb-2">
        <div className="flex min-h-10 flex-col">
          <DropZone
            columnId={id}
            index={0}
            active={isIndicatorHere && indicator.index === 0}
            afterId={todos[0]?.id}
            onAdd={addHandlerFor(0)}
          />

          {creatingAt === 0 && createForm}

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
                onAdd={addHandlerFor(index + 1)}
              />

              {creatingAt === index + 1 && createForm}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* CREATE — no background of its own, so it follows the column's */}
      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={() => openAt(todos.length)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-200"
        >
          <Plus size={20} />
          Create
        </button>
      </div>
    </div>
  );
}
