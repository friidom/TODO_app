import type { IBoard } from "@/types/data";

// Resolves to board ids and fetches per board rather than one scope-keyed query — keeps every mutation
// patching the same one-board-array cache shape (["todos", boardId]) instead of forking the write path.
export type ViewScope =
  | { kind: "board"; boardId: string | undefined }
  | { kind: "space"; spaceId: string | null }
  | { kind: "all" };

// a "board" scope doesn't check membership in `boards` — the board page can render before the
// board list resolves, and filtering against it would make the open board vanish for a tick
export function boardIdsInScope(scope: ViewScope, boards: IBoard[]): string[] {
  if (scope.kind === "board") return scope.boardId ? [scope.boardId] : [];

  const relevant =
    scope.kind === "all"
      ? boards
      : boards.filter((board) => board.space_id === scope.spaceId);

  // sorted so the id list is referentially stable and a reordered `boards` array doesn't restart every query
  return relevant.map((board) => board.id).sort();
}
