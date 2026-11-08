import type { IBoard, ISpace } from "@/types/data";

export interface SpaceGroup {
  space: Pick<ISpace, "id" | "title"> | null;
  // false for someone else's space, which a board shared with you is filed in
  owned: boolean;
  boards: IBoard[];
}

const byTitle = (a: string | null, b: string | null) =>
  (a ?? "").localeCompare(b ?? "");

export function groupBoardsBySpace(
  boards: IBoard[],
  spaces: ISpace[],
): SpaceGroup[] {
  const owned = new Set(spaces.map((space) => space.id));
  const shared = new Map<string, Pick<ISpace, "id" | "title">>();

  for (const board of boards) {
    if (board.space_id && board.space_title && !owned.has(board.space_id)) {
      shared.set(board.space_id, {
        id: board.space_id,
        title: board.space_title,
      });
    }
  }

  const inSpace = (spaceId: string) =>
    boards
      .filter((board) => board.space_id === spaceId)
      .sort((a, b) => byTitle(a.title, b.title));

  const groups: SpaceGroup[] = [
    ...spaces.map((space) => ({ space, owned: true })),
    ...[...shared.values()].map((space) => ({ space, owned: false })),
  ]
    .sort((a, b) => byTitle(a.space.title, b.space.title))
    .map((group) => ({ ...group, boards: inSpace(group.space.id) }));

  const unfiled = boards
    .filter(
      (board) =>
        board.space_id === null ||
        (!owned.has(board.space_id) && !shared.has(board.space_id)),
    )
    .sort((a, b) => byTitle(a.title, b.title));

  if (unfiled.length)
    groups.push({ space: null, owned: true, boards: unfiled });

  return groups;
}
