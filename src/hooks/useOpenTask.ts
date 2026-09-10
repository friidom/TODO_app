import { useCallback } from "react";
import { useSearchParams } from "react-router";

// ?task=<id> — an overlay, not a nested route, so the board stays mounted behind it and other view params ride along for free.
export function useOpenTask() {
  const [searchParams, setSearchParams] = useSearchParams();

  const taskId = searchParams.get("task") ?? undefined;

  // push, not replace — opening a task is a navigation, back should close it
  const openTask = useCallback(
    (todoId: string) =>
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("task", todoId);
        return next;
      }),
    [setSearchParams],
  );

  const closeTask = useCallback(
    () =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete("task");
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return { taskId, openTask, closeTask };
}
