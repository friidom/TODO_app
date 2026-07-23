import type { IServiceTodo } from "../types/data";
import { useToggleTodo } from "../services/lib/todos/useToggleTodo";
import { useDeleteTodo } from "../services/lib/todos/useDeleteTodo";

export default function TodoItem(todo: IServiceTodo) {
  const toggleTodoMutation = useToggleTodo();
  const deleteTodoMutation = useDeleteTodo();
  const { title, completed } = todo;
  return (
    <div>
      <input
        type="checkbox"
        checked={completed}
        onChange={() => {
          toggleTodoMutation.mutate(todo);
        }}
      />
      <span>{title}</span>
      <button
        onClick={() => {
          deleteTodoMutation.mutate(todo.id);
        }}
      >
        x
      </button>
    </div>
  );
}
