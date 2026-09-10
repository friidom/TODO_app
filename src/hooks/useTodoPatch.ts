import { useCallback } from "react";

import type { TodoPatch } from "@/services/todos/todoApi";
import { useUpdateTodo } from "@/services/todos/useUpdateTodo";
import type { Todo } from "@/types/data";

export type TodoFields = Omit<TodoPatch, "id" | "board_id">;

// board_id rides along with every patch because updateTodo upserts and needs it for the INSERT policy, not because anything changes it.
export function useTodoPatch(todo: Pick<Todo, "id" | "board_id">) {
  const updateTodo = useUpdateTodo();
  const { id, board_id } = todo;

  return useCallback(
    (fields: TodoFields, options?: { onSuccess?: () => void }) =>
      updateTodo.mutate({ id, board_id, ...fields }, options),
    [updateTodo, id, board_id],
  );
}
