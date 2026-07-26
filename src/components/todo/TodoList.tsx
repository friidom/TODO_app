import TodoItem from "./TodoItem";
import type { IServiceTodo } from "../../types/data";

interface TodoListProps {
  todos: IServiceTodo[];
}

export default function TodoList({ todos }: TodoListProps) {
  return (
    // min-h-0 здесь критически важен, и теперь он будет работать как надо
    <div className="min-h-0 flex-1 max-h-142 overflow-y-auto rounded-md bg-red-200 shadow-lg">
      {todos.map((todo) => (
        <TodoItem key={todo.id} {...todo} />
      ))}
    </div>
  );
}