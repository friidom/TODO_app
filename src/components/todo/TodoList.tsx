import TodoItem from "./TodoItem";
import type {  ISupabaseTodo } from "../../types/data";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface TodoListProps {
  todos: ISupabaseTodo[];
}

export default function TodoList({ todos }: TodoListProps) {
  return (
    <div className="bg-card min-h-[450px] overflow-y-auto rounded-xl shadow-lg">
      {/* <SortableContext
        items={todos.map((todo) => todo.id)}
        strategy={verticalListSortingStrategy}
      > */}
        {todos.map((todo) => (
          <TodoItem key={todo.id} {...todo} />
        ))}
      {/* </SortableContext> */}
     
    </div>
  );
}
