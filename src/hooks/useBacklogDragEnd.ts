import { useQueryClient } from "@tanstack/react-query";
import type { DragEndEvent } from "@dnd-kit/core";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { BacklogBoard } from "@/services/todos/backlog";
import { resolveDropIndex } from "@/services/todos/dropIndex";
import { isGenuineSubtask } from "@/services/todos/subtasks";
import { useBacklogDrop } from "@/services/todos/useBacklogDrop";
import type { IColumn, Todo } from "@/types/data";
import { byBacklogRank } from "@/utils/backlogRank";
import type { BacklogIndicator } from "./useBacklogDnd";

interface BacklogDragEndParams {
  /** What the page actually rendered, grouped by section — `buildBacklogBoard`
   * over `useVisibleTodos()`'s (filtered/searched) output. The gap the user
   * saw is numbered over this, not over every row the section really has —
   * same distinction `useBoardDragEnd` draws between its `visibleByColumn`
   * and its own full `todos`. */
  board: BacklogBoard;
  columns: IColumn[];
  activeSprintId: string | null;
  indicator: BacklogIndicator | null;
  resetDrag: () => void;
}

/**
 * What a Backlog-page drag means once it ends — `useBoardDragEnd.ts`'s
 * counterpart for this page, narrowed to this page's one drag kind.
 * `useBacklogDrop` (`services/todos/useBacklogDrop.ts`) is this page's
 * `useTodoDrop` — the optimistic-write-plus-snapshot mutation, so a card
 * lands the instant the pointer releases rather than after a network round
 * trip. This hook's own job mirrors `useBoardDragEnd`'s exactly: resolve
 * which card and where, translate the rendered gap into a stored-list index
 * via `resolveDropIndex` (the same function the Board's own drag uses), and
 * hand the rest to the mutation.
 */
export function useBacklogDragEnd({
  board,
  columns,
  activeSprintId,
  indicator,
  resetDrag,
}: BacklogDragEndParams) {
  const boardId = useBoardId();
  const queryClient = useQueryClient();
  const backlogDrop = useBacklogDrop();

  const onDragEnd = ({ active }: DragEndEvent) => {
    if (!indicator) {
      resetDrag();
      return;
    }

    // The live, unfiltered array — the same read the dropdown-driven
    // `sprintAssignmentPatch` call already makes (`BacklogRow`), and for the
    // same reason: `board` may be narrowed by a filter or search, and a drop
    // has to land among every row the section really has, not just the ones
    // on screen.
    const todos =
      queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

    const dragged = todos.find((candidate) => candidate.id === active.id);

    if (!dragged) {
      resetDrag();
      return;
    }

    const targetSectionId = indicator.sectionKey;

    const visible =
      targetSectionId === null
        ? board.unplanned
        : (board.sprintSections.find(
            (section) => section.sprint.id === targetSectionId,
          )?.items ?? []);

    // `todos` is the raw board cache — cards and genuine Subtasks alike.
    // Every genuine Subtask carries `sprint_id: null` (enforced by the
    // hierarchy trigger), so without this filter every Subtask on the
    // *entire board* would silently sit in `full` whenever the drop targets
    // the ungrouped Backlog section — rows `visible` (the rendered list,
    // already Subtask-free via `useVisibleTodos`) never had, corrupting the
    // gap→index translation below. Same fix `sprintAssignmentPatch`
    // (`services/todos/backlog.ts`) applies to its own, separately-built
    // list — the two must agree on what "every row of this section" means.
    const full = todos
      .filter(
        (candidate) =>
          candidate.sprint_id === targetSectionId &&
          !isGenuineSubtask(todos, candidate),
      )
      .sort(byBacklogRank);

    const dropIndex = resolveDropIndex(
      full,
      visible,
      indicator.index,
      dragged.id,
    );

    backlogDrop.mutate({
      todos,
      dragged,
      targetSectionId,
      activeSprintId,
      columns,
      dropIndex,
    });

    resetDrag();
  };

  return { onDragEnd };
}
