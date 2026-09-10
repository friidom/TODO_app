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
  board: BacklogBoard;
  columns: IColumn[];
  activeSprintId: string | null;
  indicator: BacklogIndicator | null;
  resetDrag: () => void;
}

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

    // unfiltered — board may be narrowed by a filter/search, but a drop has to land among every row the section really has
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

    // every genuine Subtask has sprint_id: null, so without this filter every Subtask on the board
    // would land in `full` when targeting the ungrouped section — `visible` is already Subtask-free
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
