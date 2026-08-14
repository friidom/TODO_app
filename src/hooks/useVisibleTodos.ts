import { useMemo } from "react";

import { useAuth } from "@/services/auth/useAuth";
import { useColumns } from "@/services/columns/useColumnsApi";
import {
  filterTodos,
  orderByBoard,
  searchTodos,
  sortTodos,
} from "@/services/todos/view";
import type { ViewScope } from "@/services/views/scope";
import type { IColumn } from "@/types/data";
import { useBoardId } from "./useBoardId";
import { useBoardView } from "./useBoardView";
import { useScopedTodos } from "./useScopedTodos";

const EMPTY_COLUMNS: IColumn[] = [];

/**
 * The work items the current view is asking for: **scope → filter → search →
 * sort**.
 *
 * **The single place any of that happens**, and the reason is the failure it
 * prevents rather than tidiness: the Kanban and the list are two renderings of
 * one answer, so neither may own the question. Put the filter in `KanbanBoard`
 * and the list disagrees with it the first time one of them changes.
 *
 * Grouping is deliberately *not* here. It is the same `groupTodos` for both
 * views, but what a group becomes — a swimlane, a section header — is the
 * view's own business, and the two need the groups at different points in their
 * markup. The pipeline ends where the shared answer ends.
 *
 * Ordering is part of the answer, not a rendering detail. Under a view sort
 * that is `sortTodos`; under `manual` it is `orderByBoard`, because the cache
 * stops being in board order the first time a card is dragged. Either way the
 * array that comes out is already in display order, so the board buckets it
 * into columns without sorting and the list renders it as-is.
 *
 * **Scope defaults to the board in the URL** (M16), which is what both current
 * views want and is exactly what this hook did before scope existed. A caller
 * that passes a space or an `all` scope gets the same pipeline over more
 * boards — that is the whole point of naming the stage.
 *
 * `total` is what the scope holds, `todos` is what survived. The header shows
 * both, because "3 tasks" on a narrowed board is a lie of omission.
 */
export function useVisibleTodos(scope?: ViewScope) {
  const boardId = useBoardId();

  const {
    todos: all,
    isLoading,
    error,
  } = useScopedTodos(scope ?? { kind: "board", boardId });

  const { data: columns = EMPTY_COLUMNS } = useColumns();
  const { filters, query, sort, dir } = useBoardView();
  const { user } = useAuth();

  const todos = useMemo(() => {
    // Filter before search, and both before sort. Filter and search commute —
    // they are independent predicates — but ordering a smaller array is
    // cheaper, and `sortTodos` must run last or it would sort rows that are
    // about to be discarded.
    const matching = searchTodos(filterTodos(all, filters, user?.id), query);

    return sort === "manual"
      ? orderByBoard(matching, columns)
      : sortTodos(matching, sort, dir);
  }, [all, columns, filters, query, user?.id, sort, dir]);

  return {
    todos,
    /** Every card in scope, however the view is narrowed. */
    all,
    total: all.length,
    hidden: all.length - todos.length,
    isLoading,
    error,
  };
}
