import TodoItem from "./TodoItem";
import type { IServiceTodo } from "../types/data";

interface TodoListProps {
  todos: IServiceTodo[];
}

export default function TodoList({ todos }: TodoListProps) {
  // const todos = useTodoStore((state) => state.todos);

  return (
    <div>
      {todos.map((todo) => (
        <TodoItem key={todo.id}  {...todo} />
      ))}
    </div>
  );
}
