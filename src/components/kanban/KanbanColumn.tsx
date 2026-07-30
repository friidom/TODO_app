import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import TodoItem from "../todo/TodoItem";
import type { ISupabaseTodo, TodoStatus } from "../../types/data";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useAddTodo } from "../../services/lib";

interface Props {
  headerTitle: string;
  id: TodoStatus;
  todos: ISupabaseTodo[];
  openMenuId: number | null;
  setOpenMenuId: React.Dispatch<React.SetStateAction<number | null>>;
}

export default function KanbanColumn({
  id,
  headerTitle,
  openMenuId,
  setOpenMenuId,
  todos,
}: Props) {
  const { setNodeRef } = useDroppable({
    id,
  });

  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");

  const addTodoMutation = useAddTodo();
  const status = id;

  const handleAddTodo = (e?: React.SyntheticEvent) => {
    e?.preventDefault();

    if (!title.trim()) return;

    addTodoMutation.mutate(
      {
        title: title.trim(),
        status,
      },
      {
        onSuccess: () => {
          setTitle("");
          setIsCreating(false);
        },
      },
    );
  };
console.log("openMenuId =", openMenuId);
  return (
    <div
      ref={setNodeRef}
      className="flex h-fit max-h-[calc(100vh-220px)] w-[280px] shrink-0 flex-col overflow-hidden rounded-xl bg-[#f8f8f8]"
    >
      {/* HEADER */}
      <div className="flex shrink-0 items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-700">{headerTitle}</h2>

          <span className="rounded-md bg-gray-200 px-2 py-0.5 text-sm font-semibold text-gray-600">
            {todos.length}
          </span>
        </div>
      </div>

      {/* TODO LIST */}
      <SortableContext
        id={id}
        items={todos.map((todo) => todo.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="min-h-0 overflow-y-auto px-3 pb-2">
          <div className="flex flex-col gap-2">
            {todos.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
                Drop todos here
              </div>
            ) : (
              todos.map((todo) => (
                <TodoItem
                  key={todo.id}
                  menuOpen={openMenuId === todo.id}
                  openMenu={() => setOpenMenuId(todo.id)}
                  closeMenu={() => setOpenMenuId(null)}
                  {...todo}
                />
              ))
            )}
          </div>
        </div>
      </SortableContext>

      {/* CREATE */}
      <div className="shrink-0 bg-[#f8f8f8] p-2">
        {!isCreating ? (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
          >
            <Plus size={22} />
            <span>Create</span>
          </button>
        ) : (
          <div className="rounded-xl border-2 border-blue-500 bg-white p-3 shadow-sm">
            {/* TITLE */}
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddTodo();
                }

                if (e.key === "Escape") {
                  setTitle("");
                  setIsCreating(false);
                }
              }}
              className="w-full bg-transparent text-base text-gray-800 outline-none placeholder:text-gray-400"
            />

            {/* ACTIONS */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                >
                  🐞
                </button>

                <button
                  type="button"
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                >
                  📅
                </button>

                <button
                  type="button"
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                >
                  👤
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTitle("");
                    setIsCreating(false);
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleAddTodo}
                  disabled={!title.trim() || addTodoMutation.isPending}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {addTodoMutation.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
