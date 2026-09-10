import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";
import { DEFAULT_KEY_PREFIX } from "@/utils/taskKey";

// Fallback is defensive, not a real state — key_prefix is NOT NULL, this just guards a card rendered before the board query settles.
export function useKeyPrefix(): string {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);

  return board?.key_prefix ?? DEFAULT_KEY_PREFIX;
}
