import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { DragTarget } from "@/hooks/useTimelineDrag";
import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { DayRange } from "@/services/views/timelineDrag";
import { schedulePatches } from "@/services/views/timelineHierarchy";
import { fromCalendarDay } from "@/utils/dueDate";
import { useUpdateTodo } from "./useUpdateTodo";

const toInstant = (day: string | null) => (day ? fromCalendarDay(day) : null);

// No new write path — useUpdateTodo per row, the same mutation the date controls use,
// so each row is patched optimistically and rolled back on its own failure.
export function useTimelineSchedule() {
  const updateTodo = useUpdateTodo();
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useCallback(
    (target: DragTarget, range: DayRange): Promise<unknown> => {
      if (!target.node) return Promise.resolve();

      const patches = schedulePatches(
        target.node,
        target.base,
        range,
        target.mode,
      );

      return Promise.allSettled(
        patches.map(({ id, board_id, start, end }) =>
          updateTodo.mutateAsync({
            id,
            board_id,
            // fromCalendarDay writes midnight UTC explicitly — a bare YYYY-MM-DD would let Postgres cast in its own server timezone.
            ...(start === undefined ? {} : { start_date: toInstant(start) }),
            ...(end === undefined ? {} : { due_date: toInstant(end) }),
          }),
        ),
      ).then((results) => {
        // A branch move is several writes; one failing would leave the cache
        // showing the others' optimistic dates against a rollback snapshot.
        if (results.some((result) => result.status === "rejected")) {
          return queryClient.invalidateQueries({
            queryKey: queryKeys.todos(boardId),
          });
        }
      });
    },
    [updateTodo, queryClient, boardId],
  );
}
