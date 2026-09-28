import { useMemo } from "react";

import { useAuth } from "@/services/auth/useAuth";
import {
  filterTodos,
  orderByBoard,
  searchTodos,
  sortTodos,
} from "@/services/todos/view";
import { topLevelTodos } from "@/services/todos/subtasks";
import type { ViewScope } from "@/services/views/scope";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import { EMPTY_WORKFLOW } from "@/services/workflow/statuses";
import { useBoardId } from "./useBoardId";
import { useBoardView } from "./useBoardView";
import { useScopedTodos } from "./useScopedTodos";

// The one pipeline every view (board/list/calendar/timeline/summary) reads: scope -> filter -> search -> sort.
// Keeping this in one place is what stops the board and the list disagreeing about which cards are visible.
export function useVisibleTodos(scope?: ViewScope) {
  const boardId = useBoardId();

  const {
    todos: rows,
    isLoading,
    error,
  } = useScopedTodos(scope ?? { kind: "board", boardId });

  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();
  const { filters, query, sort, dir } = useBoardView();
  const { user } = useAuth();

  // fetchTodos returns subtasks too (the parent panel needs them), so this is the one place they get dropped for every view.
  const all = useMemo(() => topLevelTodos(rows), [rows]);

  const todos = useMemo(() => {
    const matching = searchTodos(filterTodos(all, filters, user?.id), query);

    return sort === "manual"
      ? orderByBoard(matching, workflow)
      : sortTodos(matching, sort, dir);
  }, [all, workflow, filters, query, user?.id, sort, dir]);

  return {
    todos,
    all,
    total: all.length,
    hidden: all.length - todos.length,
    isLoading,
    error,
  };
}
