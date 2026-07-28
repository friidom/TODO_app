import { useDroppable } from "@dnd-kit/core";
import TodoList from "./TodoList";
import type { ISupabaseTodo } from "../../types/data";

interface TodoColumnProps {
  id: "todo" | "in_progress" | "completed" | "rejected";
  title: string;
  todos: ISupabaseTodo[];
}

export default function TodoColumn({
  id,
  title,
  todos,
}: TodoColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div className="flex flex-col">
      <h2 className="mb-3 text-xl font-bold">{title}</h2>

      <div
        ref={setNodeRef}
        className={`
          rounded-xl
          transition
          ${
            isOver
              ? "bg-blue-500/10 ring-2 ring-blue-500"
              : ""
          }
        `}
      >
        <TodoList todos={todos} />
      </div>
    </div>
  );
}