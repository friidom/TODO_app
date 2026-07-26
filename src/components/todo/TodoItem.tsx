import type { IServiceTodo, ISupabaseTodo } from "../../types/data";
import { useToggleTodo } from "../../services/lib/index";
import { useDeleteTodo } from "../../services/lib/index";
import { Checkbox } from "../ui/checkbox";
import { Trash2 } from "lucide-react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { CSS } from "@dnd-kit/utilities";
export default function TodoItem(todo: ISupabaseTodo) {
  const toggleTodoMutation = useToggleTodo();
  const deleteTodoMutation = useDeleteTodo();
  const { title, completed } = todo;

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

      <p
        className={`line-clamp-1 min-w-0 flex-1 group-hover:line-clamp-none group-focus:line-clamp-none group-focus-visible:line-clamp-none ${completed ? " text-gray-500 line-through decoration-2" : "text-clr-todo-text"}`}
      >
        {title}
      </p>
      <button
        className="flex size-6 shrink-0  cursor-pointer items-center justify-center rounded-full"
        aria-label="Delete Todo"
        type="button"
        onClick={() => {
          deleteTodoMutation.mutate(todo.id);
        }}
      >
        <p className="sr-only">Delete</p>
        <Trash2 className="text-clr-todo-placeholder" />
      </button>
    </div>
  );
}
