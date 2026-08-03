import { useColumns } from "@/services/columns/useColumnsApi";
import { useTodos } from "@/services/lib";
import React from "react";

export default function useTodosByColumns() {
    const { data: todos, isLoading, error } = useTodos();
  const { data: columns = [] } = useColumns();
  const grouped: Record<string, typeof todos> = {};

  //!Grouping and Sorting Todos
  const todosByColumn = React.useMemo(() => {
    columns.forEach((column) => {
      grouped[column.id] = [];
    });

    todos?.forEach((todo) => {
      grouped[todo.column_id]?.push(todo);
    });

    Object.values(grouped).forEach((columnTodos) => {
      columnTodos?.sort((a, b) => a.position - b.position);
    });

    return grouped;
  }, [todos, columns]);

  return {todosByColumn, columns};
}
