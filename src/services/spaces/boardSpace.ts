import i18n from "@/components/i18n";
import type { IBoard, ISpace } from "@/types/data";

// null when the board is filed but its space's name is not known yet, which
// callers render as nothing rather than a guess.
export function spaceNameOf(
  board: Pick<IBoard, "space_id" | "space_title">,
  spaces: readonly Pick<ISpace, "id" | "title">[] = [],
): string | null {
  if (board.space_id === null) return i18n.t("common.unfiled");

  return (
    board.space_title ??
    spaces.find((space) => space.id === board.space_id)?.title ??
    null
  );
}
