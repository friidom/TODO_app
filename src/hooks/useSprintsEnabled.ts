import { useBoardId } from "./useBoardId";
import { useBoard } from "@/services/boards/useBoard";

// boards.sprints_enabled (migration 0020), read in one place so every sprint
// surface hides on the same answer.
//
// Defaults to true while the board query is in flight: sprints are on for every
// board by default, so assuming off would blink the Backlog tab out and back on
// every time the page loaded.
export function useSprintsEnabled(): boolean {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);

  return board?.sprints_enabled ?? true;
}
