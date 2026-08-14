import type { IBoard, ISpace } from "@/types/data";

/**
 * Boards arranged under the spaces they are filed in (M15). Pure.
 *
 * The sidebar's whole structure comes out of this one function, which is why it
 * is here and not in the component: it is the piece with rules worth pinning
 * down, and the component around it is markup.
 */

export interface SpaceGroup {
  /** The space, or `null` for the unfiled group. */
  space: ISpace | null;
  boards: IBoard[];
}

/** `title` is nullable on both tables; sort as the UI labels them. */
const byTitle = (a: string | null, b: string | null) =>
  (a ?? "").localeCompare(b ?? "");

/**
 * @param boards every board the caller can reach — owned *and* shared with them
 * @param spaces the caller's own spaces, which is all RLS will ever return
 *
 * **A board whose `space_id` names a space that is not in `spaces` is
 * unfiled**, and that is not a defensive edge case — it is the normal state of
 * a shared board. Spaces are owner-only, so when someone files a board you are
 * a member of, you cannot read the space row and the board belongs in no folder
 * of yours. Matching on the id you actually hold gets that right without the
 * component ever knowing why.
 *
 * **Empty spaces are kept.** A folder you made and have not filled is still
 * yours, and hiding it would make it impossible to file the first board into
 * it. The unfiled group is dropped when empty for the opposite reason: it is
 * not a thing anyone created, it is a leftover, and a permanently visible empty
 * "Unfiled" heading is furniture.
 */
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

  // Last, always: it is where a board sits until someone decides otherwise, so
  // it reads as the remainder rather than as a peer of the named folders.
  if (unfiled.length) groups.push({ space: null, boards: unfiled });

  return groups;
}
