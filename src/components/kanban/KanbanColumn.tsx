import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import TodoItem from "../todo/TodoItem";
import type { ISupabaseTodo } from "../../types/data";

interface Props {
  title: string;
  id: string;
  todos: ISupabaseTodo[];
}

export default function KanbanColumn({ title, id, todos }: Props) {
  const { setNodeRef } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className="
    h-[72vh]
    w-[340px]
    min-w-0
    overflow-hidden
    rounded-3xl
    border
    border-app
    bg-card
    shadow-lg
    transition-shadow
    duration-300
    hover:shadow-xl
  "
    >
      <div
        className="
    flex
    items-center
    justify-between
    border-b
    border-app
    px-5
    py-4
  "
      >
        <h2 className="text-main text-sm font-semibold uppercase tracking-wider">
          {title}
        </h2>

        <span
          className="
      rounded-full
      bg-gray-200
      px-2
      py-0.5
      text-xs
      font-semibold
      text-gray-700
    "
        >
          {todos.length}
        </span>
      </div>
      
      <SortableContext
        id={id}
        items={todos.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          className="  flex-1
    overflow-y-auto
    px-3
    pt-2
    pb-3
    flex
    flex-col
    gap-3
"
        >
          {todos.length === 0 ? (
      <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-app text-sm text-gray-400">
        Drop todos here
      </div>
    ) : (
      todos.map(todo => (
        <TodoItem key={todo.id} {...todo} />
      ))
    )}
        </div>
      </SortableContext>
    </div>
  );
}
