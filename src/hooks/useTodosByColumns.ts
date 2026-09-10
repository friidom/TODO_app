import { useColumns } from "@/services/columns/useColumnsApi";
import React from "react";
import type { IColumn, Todo } from "@/types/data";
import { isOnBoard } from "@/services/todos/backlog";
import { useSprints } from "@/services/sprints/useSprints";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";

// stable reference — a fresh `[]` default would re-run the memo below on every render while the query has no data
const EMPTY_COLUMNS: IColumn[] = [];

// buckets, doesn't sort — useVisibleTodos already put the array in display order
export default function useTodosByColumns(todos: Todo[]) {
  const { data: columns = EMPTY_COLUMNS } = useColumns();
  const { data: sprints = [], isPending: sprintsPending } = useSprints();

  const activeSprintId = activeSprintIdOf(sprints);

  const todosByColumn = React.useMemo(() => {
    const grouped: Record<string, Todo[]> = {};

    columns.forEach((column) => {
      grouped[column.id] = [];
    });

    todos.forEach((todo) => {
      // isOnBoard implies this, but TS can't narrow column_id through a function call
      if (todo.column_id === null) return;
      if (!isOnBoard(todo, activeSprintId)) return;

      grouped[todo.column_id]?.push(todo);
    });

    return grouped;
  }, [todos, columns, activeSprintId]);

  return { todosByColumn, columns, activeSprintId, sprintsPending };
}
