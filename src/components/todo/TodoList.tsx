import TodoItem from "./TodoItem";
import type { IServiceTodo } from "../../types/data";

interface TodoListProps {
  todos: IServiceTodo[];
}

export default function TodoList({ todos }: TodoListProps) {
  // const todos = useTodoStore((state) => state.todos);

  return (
    <div className="flex-1 max-h-[800px] overflow-y-auto rounded-md bg-red-200 shadow-lg">
      {todos.map((todo) => (
        <TodoItem key={todo.id} {...todo} />
      ))}
    </div>
  );
}
