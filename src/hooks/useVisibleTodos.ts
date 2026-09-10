import { useMemo } from "react";

import { useAuth } from "@/services/auth/useAuth";
import { useColumns } from "@/services/columns/useColumnsApi";
import {
  filterTodos,
  orderByBoard,
  searchTodos,
  sortTodos,
} from "@/services/todos/view";
import { topLevelTodos } from "@/services/todos/subtasks";
import type { ViewScope } from "@/services/views/scope";
import type { IColumn } from "@/types/data";
import { useBoardId } from "./useBoardId";
import { useBoardView } from "./useBoardView";
import { useScopedTodos } from "./useScopedTodos";

const EMPTY_COLUMNS: IColumn[] = [];

// The one pipeline every view (board/list/calendar/timeline/summary) reads: scope -> filter -> search -> sort.
// Keeping this in one place is what stops the board and the list disagreeing about which cards are visible.
export function useVisibleTodos(scope?: ViewScope) {
  const boardId = useBoardId();

  const {
    todos: rows,
    isLoading,
    error,
  } = useScopedTodos(scope ?? { kind: "board", boardId });

  const { data: columns = EMPTY_COLUMNS } = useColumns();
  const { filters, query, sort, dir } = useBoardView();
  const { user } = useAuth();

  // fetchTodos returns subtasks too (the parent panel needs them), so this is the one place they get dropped for every view.
  const all = useMemo(() => topLevelTodos(rows), [rows]);

  const todos = useMemo(() => {
    const matching = searchTodos(filterTodos(all, filters, user?.id), query);

    return sort === "manual"
      ? orderByBoard(matching, columns)
      : sortTodos(matching, sort, dir);
  }, [all, columns, filters, query, user?.id, sort, dir]);

  return {
    todos,
    all,
    total: all.length,
    hidden: all.length - todos.length,
    isLoading,
    error,
  };
}
