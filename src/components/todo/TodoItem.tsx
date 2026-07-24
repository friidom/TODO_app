import type { IServiceTodo } from "../../types/data";
import { useToggleTodo } from "../../services/lib/index";
import { useDeleteTodo } from "../../services/lib/index";
import { Checkbox } from "../ui/checkbox";
import { Trash2 } from "lucide-react";
export default function TodoItem(todo: IServiceTodo) {
  const toggleTodoMutation = useToggleTodo();
  const deleteTodoMutation = useDeleteTodo();
  const { title, completed } = todo;
  return (
    <div className=" group flex snap-start items-center justify-between gap-2 border-b border-clr-todo-borders py-4 pl-2 pr-5 ">
      <Checkbox
        className={`size-6 shrink-0 border-red cursor-pointer rounded-full border-clr-completed text-black ${completed ? "bg-gradient-to-br from-red-500 via-white-400 to-blue-300" : ""}`}
        checked={completed}
        onClick={() => {
          toggleTodoMutation.mutate(todo);
        }}
      />
      {/* <span>{title}</span> */}
      <p
        className={`line-clamp-1  w-full grow-0 group-hover:line-clamp-none group-focus:line-clamp-none group-focus-visible:line-clamp-none ${completed ? " text-gray-500 line-through decoration-2" : "text-clr-todo-text"}`}
      >
        {title}
      </p>
      <button
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full"
        aria-label="Delete Todo"
        type="button"
        onClick={() => {
          deleteTodoMutation.mutate(todo.id);
        }}
      >
        <p className="sr-only">Delete</p>
        <Trash2 className="text-clr-todo-placeholder" />
      </button>

      {/* <button
        onClick={() => {
          deleteTodoMutation.mutate(todo.id);
        }}
      >
        x
      </button> */}
    </div>
  );
}
