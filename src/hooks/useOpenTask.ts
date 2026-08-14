import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * Which task the detail panel is showing, held in the URL as `?task=<id>`.
 *
 * **A search param rather than a nested route, and that is the M5-06
 * architecture decision.** The plan asks for a deliberate choice between a
 * panel that keeps the board behind it and a full-page route, recorded with its
 * reason, and for the work item to be addressable either way. This is the
 * panel, and the param is what makes the panel addressable without costing the
 * board anything:
 *
 * - **Board context is never lost** (UX principle 1). The board stays mounted
 *   and rendered behind the panel — no route change, no remount, no refetch,
 *   and the scroll position and collapsed columns survive because nothing
 *   unmounted them.
 * - **The view state comes along for free.** Filters, sort, group and
 *   board/list mode already live in search params (`useBoardView`). Adding one
 *   more param means opening a task cannot drop them and a shared link carries
 *   the whole view — the task *and* the filter it was found under. A nested
 *   route would have had to re-attach the query string by hand at every
 *   navigation, which is the kind of thing that works until one call site
 *   forgets.
 * - **Back closes the panel**, because opening it pushed a history entry.
 *
 * The cost, stated: the panel cannot own a route-level `errorElement`, so its
 * not-found state is rendered by the panel itself. That is the right trade for
 * a surface that is explicitly not a page.
 *
 * M11 builds more views on this shape, and M12's search results and M7's
 * comment notifications are the deep links it has to satisfy.
 */
export function useOpenTask() {
  const [searchParams, setSearchParams] = useSearchParams();

  const taskId = searchParams.get("task") ?? undefined;

  /**
   * Pushes rather than replaces, unlike every write in `useBoardView`.
   *
   * Those are adjustments to one view and should not each cost a press of the
   * back button; opening a task is a navigation, and back is how people expect
   * to leave it.
   */
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
