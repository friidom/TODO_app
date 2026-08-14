import type { IBoard } from "@/types/data";

/**
 * Which work items a view is over (M16).
 *
 * The pipeline used to begin at "the board in the URL", which is why nothing in
 * it could express a view spanning several boards. Scope is that first stage,
 * named: everything downstream — filter, search, sort, group — operates on
 * whatever this resolves to and does not care how many boards it came from.
 *
 * **Resolved to board ids, and the data is fetched per board (M16 option a).**
 * The alternative was one scope-keyed query, `["todos", { scope }]`, which
 * fetches in one request and then holds the same rows in a second cache shape.
 * Every mutation would have to patch both — and the optimistic cache functions
 * (`applyTodoInserted`/`Updated`/`Deleted`/`Moved`) each take **one board's**
 * array, as will M6-B's realtime handlers. A second shape forks the write path
 * M2-16 deliberately unified. Paying N requests to keep one write path is the
 * cheaper side of that trade.
 *
 * `["todos", boardId]` therefore keeps its exact meaning, and a multi-board
 * view is a union of entries the cache already holds — a board already open is
 * not fetched twice.
 */
export type ViewScope =
  | { kind: "board"; boardId: string | undefined }
  | { kind: "space"; spaceId: string | null }
  | { kind: "all" };

/**
 * The boards a scope covers, in a stable order.
 *
 * @param boards every board the caller can reach — `useBoards()`, already RLS-scoped
 *
 * A `board` scope does **not** check membership of `boards`: the board page
 * addresses a board by id and renders it before the board list has necessarily
 * resolved, so filtering against that list would make the open board vanish for
 * a tick. RLS is what decides whether the query returns anything.
 *
 * A `space` scope with a null id is the unfiled group — the boards in no space
 * of yours, which is where a board someone shared with you lives (M15).
 */
export function boardIdsInScope(scope: ViewScope, boards: IBoard[]): string[] {
  if (scope.kind === "board") return scope.boardId ? [scope.boardId] : [];

  const relevant =
    scope.kind === "all"
      ? boards
      : boards.filter((board) => board.space_id === scope.spaceId);

  // Sorted, so the id list is referentially comparable between renders and a
  // reordered `boards` array does not restart every query beneath it.
  return relevant.map((board) => board.id).sort();
}
