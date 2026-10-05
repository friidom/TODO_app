import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";

// "" until the board loads, which taskKey renders as no key rather than a guess.
export function useKeyPrefix(): string {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);

  return board?.key_prefix ?? "";
}
