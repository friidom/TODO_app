import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import TodoItem from "../todo/TodoItem";
import type { TodoItemProps } from "@/types/data";

export default function DraggableTodo(props: TodoItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: props.id,
      data: {
        todo: props,
      },
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.25 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <TodoItem {...props} />
    </div>
  );
}
