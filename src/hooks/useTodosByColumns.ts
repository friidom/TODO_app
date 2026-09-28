import React from "react";
import type { Todo } from "@/types/data";
import { isOnBoard } from "@/services/todos/backlog";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import { EMPTY_WORKFLOW, columnIdOf } from "@/services/workflow/statuses";
import { useBoard } from "@/services/boards/useBoard";
import { useSprints } from "@/services/sprints/useSprints";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";
import { useBoardId } from "./useBoardId";

// buckets, doesn't sort — useVisibleTodos already put the array in display order.
// A card's column is its status's column, so a column holds the cards of every
// status it shows, hidden ones included.
export default function useTodosByColumns(todos: Todo[]) {
  const boardId = useBoardId();
  // EMPTY_WORKFLOW is a stable reference — a fresh default would re-run the memo below on every render while the query has no data
  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();
  const { columns, statusById } = workflow;
  const { data: sprints = [], isPending: sprintsPending } = useSprints();
  const { data: board, isPending: boardPending } = useBoard(boardId);

  const activeSprintId = activeSprintIdOf(sprints);

  // Defaulting to the column default rather than to false: an undefined flag
  // means "not loaded", and guessing "sprints off" would flash every backlog
  // card onto the board for a frame before it resolved.
  const sprintsEnabled = board?.sprints_enabled ?? true;

  const todosByColumn = React.useMemo(() => {
    const grouped: Record<string, Todo[]> = {};

    columns.forEach((column) => {
      grouped[column.id] = [];
    });

    todos.forEach((todo) => {
      if (!isOnBoard(todo, activeSprintId, sprintsEnabled)) return;

      const columnId = columnIdOf(todo, statusById);

      if (columnId !== null) grouped[columnId]?.push(todo);
    });

    return grouped;
  }, [todos, columns, statusById, activeSprintId, sprintsEnabled]);

  return {
    todosByColumn,
    columns,
    workflow,
    activeSprintId,
    sprintsEnabled,
    // Both gate the board's loading state for the same reason: a card in the
    // running sprint must not flicker out of its column for a frame.
    sprintsPending: sprintsPending || boardPending,
  };
}
