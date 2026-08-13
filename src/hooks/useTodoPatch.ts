import { useCallback } from "react";

import type { TodoPatch } from "@/services/todos/todoApi";
import { useUpdateTodo } from "@/services/todos/useUpdateTodo";
import type { ISupabaseTodo } from "@/types/data";

/** Everything a control may write. `id` and `board_id` come from the card. */
export type TodoFields = Omit<TodoPatch, "id" | "board_id">;

/**
 * Patch one card's fields.
 *
 * The card's controls are all controlled and none of them writes — that is what
 * lets `WorkTypeControl`, `DueDateControl` and the rest serve both a saved card
 * and the create form, which holds the same values in state instead. The write
 * is the parent's job, and this is that job in one place.
 *
 * It exists because there are now three parents. `TodoCard` spelled the same
 * `updateTodo.mutate({ id, board_id, … })` out three times inline; the card menu
 * and the list row would each have added five more, and every one of them would
 * have had to remember that `board_id` travels with every patch — not because
 * anything is changing it, but because `updateTodo` upserts, so the proposed row
 * needs a board or M2-08's INSERT policy refuses it.
 *
 * One mutation, three call sites, no second write path.
 */
export function useTodoPatch(todo: Pick<ISupabaseTodo, "id" | "board_id">) {
  const updateTodo = useUpdateTodo();
  const { id, board_id } = todo;

  return useCallback(
    (fields: TodoFields, options?: { onSuccess?: () => void }) =>
      updateTodo.mutate({ id, board_id, ...fields }, options),
    [updateTodo, id, board_id],
  );
}
