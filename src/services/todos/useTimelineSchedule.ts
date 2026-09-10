import { useCallback } from "react";

import { scheduleFields, type DayRange } from "@/services/views/timelineDrag";
import type { Todo } from "@/types/data";
import { fromCalendarDay, toCalendarDay } from "@/utils/dueDate";
import { useUpdateTodo } from "./useUpdateTodo";

export type Schedulable = Pick<
  Todo,
  "id" | "board_id" | "start_date" | "due_date"
>;

// No new write path — just useUpdateTodo with a day-to-instant conversion in front, the same mutation the date controls use.
// No onMutate here: the drag itself holds the live geometry until this promise settles, so a second optimistic layer would race it.
export function useTimelineSchedule() {
  const updateTodo = useUpdateTodo();

  return useCallback(
    (todo: Schedulable, range: DayRange): Promise<unknown> => {
      const { writeStart, writeEnd } = scheduleFields(
        Boolean(todo.start_date),
        Boolean(todo.due_date),
      );

      // converted to days so the comparison below isn't timestamptz vs YYYY-MM-DD
      const storedStart = todo.start_date
        ? toCalendarDay(todo.start_date)
        : null;
      const storedEnd = todo.due_date ? toCalendarDay(todo.due_date) : null;

      const nextStart = writeStart ? range.start : storedStart;
      const nextEnd = writeEnd ? range.end : storedEnd;

      // gesture ended where it started — skip the round trip
      if (nextStart === storedStart && nextEnd === storedEnd) {
        return Promise.resolve();
      }

      return updateTodo.mutateAsync({
        id: todo.id,
        board_id: todo.board_id,
        // fromCalendarDay writes midnight UTC explicitly — a bare YYYY-MM-DD would let Postgres cast in its own server timezone.
        ...(writeStart ? { start_date: fromCalendarDay(range.start) } : {}),
        ...(writeEnd ? { due_date: fromCalendarDay(range.end) } : {}),
      });
    },
    [updateTodo],
  );
}
