import type { IBoard, ISpace } from "@/types/data";

export interface SpaceGroup {
  space: ISpace | null;
  boards: IBoard[];
}

const byTitle = (a: string | null, b: string | null) =>
  (a ?? "").localeCompare(b ?? "");

// a board whose space_id points at a space you can't read (spaces are owner-only) files as unfiled, not as a bug
export function groupBoardsBySpace(
  boards: IBoard[],
  spaces: ISpace[],
): SpaceGroup[] {
  const known = new Set(spaces.map((space) => space.id));

  const inSpace = (spaceId: string) =>
    boards
      .filter((board) => board.space_id === spaceId)
      .sort((a, b) => byTitle(a.title, b.title));

  const groups: SpaceGroup[] = spaces
    .slice()
    .sort((a, b) => byTitle(a.title, b.title))
    .map((space) => ({ space, boards: inSpace(space.id) }));

  const unfiled = boards
    .filter((board) => board.space_id === null || !known.has(board.space_id))
    .sort((a, b) => byTitle(a.title, b.title));

  if (unfiled.length) groups.push({ space: null, boards: unfiled });

  return groups;
}
