import { useCallback } from "react";

import { fromCalendarDay } from "@/utils/dueDate";
import type { Todo } from "@/types/data";
import { useUpdateTodo } from "./useUpdateTodo";

/**
 * Dropping a work item on a day (M19).
 *
 * **This is not a new write path, and that is the milestone's decision rather
 * than an implementation detail.** M19 states it plainly: *"Dragging a task to
 * a day writes `due_date` through the existing `useTodoPatch` → `updateTodo`
 * path. Not a new mutation, not a new optimistic layer. The calendar is a view;
 * views do not get their own write paths."*
 *
 * So this hook holds no mutation of its own. It is `useUpdateTodo` — the same
 * one `DueDateControl` calls when you pick a date from the card's popover —
 * with the day-to-stored-value conversion in front of it. Setting a date by
 * dragging and setting it from the menu are the same write, which is why the
 * two cannot disagree about what a date means.
 *
 * **Contrast with `useTodoDrop`, which the board needs and this does not.**
 * That hook exists because a board drop renumbers two whole columns of
 * `position` and has to patch the cache optimistically to avoid a visible
 * snap-back. A calendar drop changes one scalar on one row; `useUpdateTodo`
 * already patches the cache on success, and adding an `onMutate` here would be
 * the second optimistic layer the milestone rules out.
 *
 * `useTodoPatch` is not used directly because it binds to one card at
 * construction (`useTodoPatch(todo)`), and a drag handler learns which card
 * only when the drop happens. Same mutation underneath, same `board_id`
 * requirement — `updateTodo` upserts, so the proposed row needs a board or
 * M2-08's INSERT policy refuses it.
 */
export function useCalendarDrop() {
  const updateTodo = useUpdateTodo();

  return useCallback(
    /**
     * @param day `YYYY-MM-DD`, or null to clear the date and send the item back
     *   to the undated strip.
     */
    (todo: Pick<Todo, "id" | "board_id" | "due_date">, day: string | null) => {
      // Nothing to write. A drop onto the day an item is already on is a
      // gesture that ended where it started, and a round trip plus a cache
      // patch for a value that did not change is a flicker with no cause.
      const current = todo.due_date ? todo.due_date.slice(0, 10) : null;

      if (current === day) return;

      updateTodo.mutate({
        id: todo.id,
        board_id: todo.board_id,
        // `fromCalendarDay` writes midnight UTC with an explicit `Z`, which is
        // the convention `utils/dueDate.ts` established and reads back by
        // slicing. Sending the bare `YYYY-MM-DD` would let Postgres cast it in
        // the *database's* timezone, so the stored instant would depend on a
        // server setting rather than on the day the user dropped on.
        due_date: day === null ? null : fromCalendarDay(day),
      });
    },
    [updateTodo],
  );
}
