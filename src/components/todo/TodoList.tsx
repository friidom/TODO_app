import TodoItem from "./TodoItem";
import type { IServiceTodo, ISupabaseTodo } from "../../types/data";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface TodoListProps {
  todos: ISupabaseTodo[];
}

export default function TodoList({ todos }: TodoListProps) {
  return (
    // min-h-0 здесь критически важен, и теперь он будет работать как надо
    <div className="min-h-0 min-w-[500px] flex-1 max-h-142  overflow-y-auto scrollbar-hidden rounded-t-md bg-red-200 shadow-lg">
      <SortableContext
        items={todos.map((todo) => todo.id)}
        strategy={verticalListSortingStrategy}
      >
        {todos.map((todo) => (
          <TodoItem key={todo.id} {...todo} />
        ))}
      </SortableContext>
     
    </div>
  );
}
