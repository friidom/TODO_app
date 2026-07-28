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

    if (!over) return;

    const todos = queryClient.getQueryData<ISupabaseTodo[]>(["todos"]) ?? [];

    saveTodoOrder.mutate(todos);
  };
}
