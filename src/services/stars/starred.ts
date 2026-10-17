import type { IBoard } from "@/types/data";

export interface Star {
  board_id: string;
  starred_at: string;
}

// A star whose board is not in the index is one the reader lost, so it is dropped rather than drawn without a name.
export function starredBoards(boards: IBoard[], stars: Star[]): IBoard[] {
  const byId = new Map(boards.map((board) => [board.id, board]));

  return [...stars]
    .sort((a, b) => b.starred_at.localeCompare(a.starred_at))
    .map((star) => byId.get(star.board_id))
    .filter((board): board is IBoard => board !== undefined);
}

export function applyStarToggled(
  stars: Star[],
  boardId: string,
  on: boolean,
  now: string,
): Star[] {
  const rest = stars.filter((star) => star.board_id !== boardId);

  return on ? [{ board_id: boardId, starred_at: now }, ...rest] : rest;
}
