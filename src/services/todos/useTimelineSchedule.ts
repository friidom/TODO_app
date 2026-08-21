import { useCallback } from "react";

import { scheduleFields, type DayRange } from "@/services/views/timelineDrag";
import type { Todo } from "@/types/data";
import { fromCalendarDay, toCalendarDay } from "@/utils/dueDate";
import { useUpdateTodo } from "./useUpdateTodo";

/** The four fields a scheduling gesture reads off the row it is moving. */
export type Schedulable = Pick<
  Todo,
  "id" | "board_id" | "start_date" | "due_date"
>;

/**
 * Committing a timeline gesture — a move, a resize, or an undated item being
 * given its first range (M20-B).
 *
 * **Not a new write path**, for exactly the reason `useCalendarDrop` records
 * one line at a time: M19 settled that *"the calendar is a view; views do not
 * get their own write paths"*, and a Gantt is no more entitled to one. So this
 * holds no mutation. It is `useUpdateTodo` — the same one the task detail's
 * Start date and Due date controls call — with the day-to-instant conversion
 * and the "which end may I write" rule in front of it. Dragging a bar and
 * typing a date into the detail panel are the same write, which is what stops
 * the two from ever disagreeing about what a date means.
 *
 * **No `onMutate` here either, and that is deliberate.** `useUpdateTodo`
 * already patches the cache on success, and the bar does not snap back in the
 * meantime because the *drag itself* is holding the live geometry — see
 * `useTimelineDrag`, which keeps its draft until this promise settles. A second
 * optimistic layer would be two things racing to own the same bar's position.
 *
 * **It returns a promise, which `useCalendarDrop` does not need to.** That is
 * the whole mechanism above: `mutateAsync` resolves *after* `onSuccess` has
 * patched the cache, so the frame that drops the draft is the first frame the
 * row already carries its new dates — no snap-back to the old position for the
 * length of a round trip. A rejection resolves it too, and there the snap-back
 * is correct: the write failed, so the bar must show what is actually stored.
 * The rejection is not swallowed — the `MutationCache` in `queryClient.ts`
 * toasts every failed mutation centrally.
 *
 * `useTodoPatch` is not used directly for the same reason the calendar avoids
 * it: it binds to one card at construction, and a drag handler learns which
 * card only when the gesture ends.
 */
export function useTimelineSchedule() {
  const updateTodo = useUpdateTodo();

  return useCallback(
    (todo: Schedulable, range: DayRange): Promise<unknown> => {
      const { writeStart, writeEnd } = scheduleFields(
        Boolean(todo.start_date),
        Boolean(todo.due_date),
      );

      // What is stored now, as days, so the comparison below is against the
      // same units the gesture produced. A `timestamptz` compared to a
      // `YYYY-MM-DD` would never be equal and every gesture would write.
      const storedStart = todo.start_date
        ? toCalendarDay(todo.start_date)
        : null;
      const storedEnd = todo.due_date ? toCalendarDay(todo.due_date) : null;

      const nextStart = writeStart ? range.start : storedStart;
      const nextEnd = writeEnd ? range.end : storedEnd;

      // A gesture that ended where it started. Same guard `useCalendarDrop`
      // makes and the same reason: a round trip and a cache patch for values
      // that did not change is a flicker with no cause. It also absorbs the
      // common case of a click that crossed the drag threshold by a pixel.
      if (nextStart === storedStart && nextEnd === storedEnd) {
        return Promise.resolve();
      }

      return updateTodo.mutateAsync({
        id: todo.id,
        board_id: todo.board_id,
        // Only the ends this item is allowed to have. A key left off the patch
        // is dropped during serialisation and the column is untouched — which
        // is how a point keeps its missing half missing rather than being
        // handed a null it did not have.
        //
        // `fromCalendarDay` writes midnight UTC with an explicit `Z`: the
        // convention `utils/dueDate.ts` established and reads back by slicing.
        // Sending a bare `YYYY-MM-DD` would let Postgres cast it in the
        // *database's* timezone, so where the bar landed would depend on a
        // server setting.
        ...(writeStart ? { start_date: fromCalendarDay(range.start) } : {}),
        ...(writeEnd ? { due_date: fromCalendarDay(range.end) } : {}),
      });
    },
    [updateTodo],
  );
}
