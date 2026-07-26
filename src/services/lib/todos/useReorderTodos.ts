import { useQueryClient } from "@tanstack/react-query";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import type { ISupabaseTodo } from "../../../types/data";
import { useSaveTodoOrder } from "./useSaveTodoOrder";

export function useReorderTodos() {
  const queryClient = useQueryClient();
  const saveTodoOrder = useSaveTodoOrder();

  return (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const todos =
      queryClient.getQueryData<ISupabaseTodo[]>(["todos"]) ?? [];

    const oldIndex = todos.findIndex((todo) => todo.id === active.id);
    const newIndex = todos.findIndex((todo) => todo.id === over.id);

    const newTodos = arrayMove(todos, oldIndex, newIndex);

    queryClient.setQueryData(["todos"], newTodos);

    saveTodoOrder.mutate(newTodos);
  };
}