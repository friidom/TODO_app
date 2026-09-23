import { useColumns } from "@/services/columns/useColumnsApi";
import React from "react";
import type { IColumn, Todo } from "@/types/data";
import { isOnBoard } from "@/services/todos/backlog";
import { useBoard } from "@/services/boards/useBoard";
import { useSprints } from "@/services/sprints/useSprints";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";
import { useBoardId } from "./useBoardId";

// stable reference — a fresh `[]` default would re-run the memo below on every render while the query has no data
const EMPTY_COLUMNS: IColumn[] = [];

// buckets, doesn't sort — useVisibleTodos already put the array in display order
export default function useTodosByColumns(todos: Todo[]) {
  const boardId = useBoardId();
  const { data: columns = EMPTY_COLUMNS } = useColumns();
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
      // isOnBoard implies this, but TS can't narrow column_id through a function call
      if (todo.column_id === null) return;
      if (!isOnBoard(todo, activeSprintId, sprintsEnabled)) return;

      grouped[todo.column_id]?.push(todo);
    });

    return grouped;
  }, [todos, columns, activeSprintId, sprintsEnabled]);

  return {
    todosByColumn,
    columns,
    activeSprintId,
    sprintsEnabled,
    // Both gate the board's loading state for the same reason: a card in the
    // running sprint must not flicker out of its column for a frame.
    sprintsPending: sprintsPending || boardPending,
  };
}
