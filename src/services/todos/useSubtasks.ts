import { useMemo } from "react";

import { useColumns } from "@/services/columns/useColumnsApi";
import type { IColumn } from "@/types/data";
import { useTodos } from "./useTodos";
import {
  doneColumnIds,
  subtaskProgress,
  subtaskProgressByParent,
  subtasksOf,
  type SubtaskProgress,
} from "./subtasks";

const EMPTY_COLUMNS: IColumn[] = [];

/**
 * One task's subtasks, and how many of them are done (M27).
 *
 * **No query of its own.** `fetchTodos` already returns every row on the
 * board, subtasks included, so this is a fold over a cache entry the board
 * page has had loaded since before the panel opened — which means it is
 * instant, and which means a subtask created, renamed, moved or deleted
 * updates this list through the cache writes that already exist rather than
 * through an invalidation somebody has to remember to add.
 *
 * `isLoading` still comes from `useTodos` rather than being hard-coded false:
 * the panel is reachable by a deep link (`?task=<id>` on a cold load), and in
 * that window the board's array genuinely has not arrived yet.
 */
export function useSubtasks(parentId: string) {
  const { data: todos = [], isPending, error } = useTodos();
  const { data: columns = EMPTY_COLUMNS } = useColumns();

  const subtasks = useMemo(
    () => subtasksOf(todos, parentId),
    [todos, parentId],
  );

  const progress = useMemo(
    () => subtaskProgress(subtasks, doneColumnIds(columns)),
    [subtasks, columns],
  );

  return { subtasks, progress, isPending, error };
}

/**
 * Progress for every parent on the board, for the card indicator.
 *
 * Computed once per board render and looked up by id, rather than each card
 * filtering the whole array for its own children — the board re-renders on
 * every pointer move during a drag, and O(cards × rows) there is exactly the
 * shape M9-05 spent a milestone removing.
 */
export function useSubtaskProgressByParent(): Map<string, SubtaskProgress> {
  const { data: todos = [] } = useTodos();
  const { data: columns = EMPTY_COLUMNS } = useColumns();

  return useMemo(
    () => subtaskProgressByParent(todos, columns),
    [todos, columns],
  );
}
