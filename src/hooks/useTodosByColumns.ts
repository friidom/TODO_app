import { useColumns } from "@/services/columns/useColumnsApi";
import { useTodos } from "@/services/lib";
import React from "react";
import { byPosition } from "@/services/lib/position";

export default function useTodosByColumns() {
  const { data: todos } = useTodos();
  const { data: columns = [] } = useColumns();

  //!Grouping and Sorting Todos
  const todosByColumn = React.useMemo(() => {
    // Built inside the memo: it was previously allocated on every render but
    // only populated here, so the memo mutated an object it did not own.
    const grouped: Record<string, typeof todos> = {};

    columns.forEach((column) => {
      grouped[column.id] = [];
    });

    todos?.forEach((todo) => {
      // `column_id` is nullable: a card with no column belongs to no group.
      // Previously this indexed `grouped[null]`, which found nothing and
      // no-opped through the optional chain — skipping is the same outcome,
      // stated deliberately.
      if (todo.column_id === null) return;

      grouped[todo.column_id]?.push(todo);
    });

    Object.values(grouped).forEach((columnTodos) => {
      columnTodos?.sort(byPosition);
    });

    return grouped;
  }, [todos, columns]);

  return {todosByColumn, columns};
}
