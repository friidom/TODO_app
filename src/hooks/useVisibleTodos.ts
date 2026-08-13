import { useMemo } from "react";

import { useAuth } from "@/services/auth/useAuth";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useTodos } from "@/services/todos/useTodos";
import { filterTodos, orderByBoard, sortTodos } from "@/services/todos/view";
import type { IColumn, ISupabaseTodo } from "@/types/data";
import { useBoardView } from "./useBoardView";

/**
 * One array for every render before the query resolves.
 *
 * A `= []` default in the destructure allocates on every render while the query
 * has no data, which changes the memo's dependency and re-runs the whole
 * pipeline each time — the same trap `useTodosByColumns` documents.
 */
const EMPTY: ISupabaseTodo[] = [];
const EMPTY_COLUMNS: IColumn[] = [];

/**
 * The cards the current view is asking for: filtered, then ordered.
 *
 * **The single place any of that happens.** The Kanban and the list are two
 * renderings of one answer, so neither owns the question — put the filter in
 * `KanbanBoard` and the list would quietly disagree with it the first time one
 * of them changed. `useTodos` still holds the untouched board array underneath;
 * this is a view over it and writes nothing.
 *
 * Ordering is part of the answer, not a rendering detail. Under a view sort that
 * is `sortTodos`; under `manual` it is `orderByBoard`, because the cache stops
 * being in board order the first time a card is dragged. Either way the array
 * that comes out is already in display order, so the board buckets it into
 * columns without sorting and the list renders it as-is.
 *
 * `total` is what the board holds, `todos` is what survived. The header shows
 * both, because "3 tasks" on a filtered board is a lie of omission — a user who
 * forgot a filter was on needs the board to say so.
 */
export function useVisibleTodos() {
  const { data = EMPTY, isLoading, error } = useTodos();
  const { data: columns = EMPTY_COLUMNS } = useColumns();
  const { filters, sort, dir } = useBoardView();
  const { user } = useAuth();

  const todos = useMemo(() => {
    const visible = filterTodos(data, filters, user?.id);

    return sort === "manual"
      ? orderByBoard(visible, columns)
      : sortTodos(visible, sort, dir);
  }, [data, columns, filters, user?.id, sort, dir]);

  return {
    todos,
    /** Every card on the board, however the view is narrowed. */
    all: data,
    total: data.length,
    hidden: data.length - todos.length,
    isLoading,
    error,
  };
}
