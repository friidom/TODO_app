import { useCallback } from "react";

import { fromCalendarDay } from "@/utils/dueDate";
import type { Todo } from "@/types/data";
import { useUpdateTodo } from "./useUpdateTodo";

// Same useUpdateTodo mutation DueDateControl calls — no separate write path or optimistic layer for the calendar view.
export function useCalendarDrop() {
  const updateTodo = useUpdateTodo();

  return useCallback(
    (todo: Pick<Todo, "id" | "board_id" | "due_date">, day: string | null) => {
      // dropping on the day it's already on is a no-op, not a round trip
      const current = todo.due_date ? todo.due_date.slice(0, 10) : null;

      if (current === day) return;

      updateTodo.mutate({
        id: todo.id,
        board_id: todo.board_id,
        // fromCalendarDay pins midnight UTC explicitly — a bare YYYY-MM-DD would let Postgres cast in the server's own timezone
        due_date: day === null ? null : fromCalendarDay(day),
      });
    },
    [updateTodo],
  );
}
