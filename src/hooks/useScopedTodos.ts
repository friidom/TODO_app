import { useQueries } from "@tanstack/react-query";

import { useBoards } from "@/services/boards/useBoards";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { fetchTodos } from "@/services/todos/todoApi";
import { boardIdsInScope, type ViewScope } from "@/services/views/scope";
import type { IBoard, Todo } from "@/types/data";

const EMPTY: Todo[] = [];
const EMPTY_BOARDS: IBoard[] = [];

/**
 * Every work item in a scope, from the same cache entries a board page uses.
 *
 * **`useQueries` over `["todos", boardId]`, one entry per board** — the M16
 * decision, with its reasoning in `services/views/scope.ts`. The point worth
 * keeping in mind when reading this later: these are the *identical* entries
 * `useTodos()` creates, not a parallel copy. A board already open is served
 * from cache rather than refetched, and every optimistic patch the mutations
 * write shows up here for free, because there is exactly one place the rows
 * live.
 *
 * That is why the scope stage landed without touching a single mutation. The
 * scope-keyed alternative would have needed all of them.
 *
 * **Today the only caller passes a board scope**, so this runs one query and
 * behaves precisely as `useTodos()` did. The multi-board path exists here
 * rather than inside the first view that wants it, because deciding it inside a
 * view is how a second pipeline gets built.
 *
 * `combine` rather than a `useMemo` over the results: it is the API's own
 * memoisation hook, so the returned object is stable while the underlying
 * queries are, and the dependency array stays honest.
 */
export function useScopedTodos(scope: ViewScope) {
  const { data: boards = EMPTY_BOARDS } = useBoards();

  // Cheap enough to run every render — a filter and a map over a handful of
  // boards — and `useQueries` diffs by query key, so a fresh array is not a
  // fresh subscription.
  const boardIds = boardIdsInScope(scope, boards);

  return useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.todos(boardId),
      queryFn: () => fetchTodos(boardId),
    })),

    combine: (results) => ({
      // One board is the common case, and returning that array itself keeps the
      // reference stable — every memo downstream (filter, search, sort, group)
      // depends on that to do nothing when nothing changed. `flatMap` would
      // allocate a new array on every render.
      todos:
        results.length === 1
          ? (results[0].data ?? EMPTY)
          : results.flatMap((result) => result.data ?? EMPTY),

      // Loading while *any* board is still in flight: a cross-board view that
      // fills in board by board reads as cards appearing at random.
      isLoading: results.some((result) => result.isLoading),

      // The first failure rather than a list. One message is what the UI
      // renders, and "three boards failed" is no more actionable than "a board
      // failed".
      error: results.find((result) => result.error)?.error ?? null,
    }),
  });
}
