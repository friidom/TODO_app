import { useMemo } from "react";

import { useColumns } from "@/services/columns/useColumnsApi";
import type { IColumn, Todo } from "@/types/data";
import { useTodos } from "./useTodos";
import {
  canHaveSubtasks,
  canPickEpicParent,
  childrenOf,
  doneColumnIds,
  epicsOf,
  isEpic,
  isGenuineSubtask,
  parentOf,
  subtaskProgress,
  subtaskProgressByParent,
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
    () => childrenOf(todos, parentId),
    [todos, parentId],
  );

  const progress = useMemo(
    () => subtaskProgress(subtasks, doneColumnIds(columns)),
    [subtasks, columns],
  );

  return { subtasks, progress, isPending, error };
}

/**
 * One Epic's own Tasks, oldest first (M28-A).
 *
 * The identical fold `useSubtasks` runs — `childrenOf` does not care whether
 * the parent is a Task or an Epic — kept as a separate hook rather than a
 * second call site for the same one, because the two callers want different
 * things back: a Task's own Subtasks come with a done/total count, and an
 * Epic's Tasks do not (M31, not this milestone).
 */
export function useEpicTasks(epicId: string) {
  const { data: todos = [], isPending, error } = useTodos();

  const tasks = useMemo(() => childrenOf(todos, epicId), [todos, epicId]);

  return { tasks, isPending, error };
}

/**
 * Every Epic on the board, for the Parent selector's candidate list (M28-A).
 *
 * No `boardId` parameter, matching `useTodos()` itself — the board comes
 * from the route, and this hook is only ever mounted inside a panel already
 * open on one.
 */
export function useEpics() {
  const { data: todos = [], isPending, error } = useTodos();

  const epics = useMemo(() => epicsOf(todos), [todos]);

  return { epics, isPending, error };
}

export interface TodoHierarchy {
  /** The full board array this classification was resolved from. */
  todos: Todo[];
  /** This item's parent row, or null if it has none (or the array does not
   * yet hold it). */
  parent: Todo | null;
  isEpic: boolean;
  /** Parented by a Task, not an Epic — the M27 "Subtask" role. */
  isGenuineSubtask: boolean;
  canHaveSubtasks: boolean;
  canPickEpicParent: boolean;
}

/**
 * One work item's role in the hierarchy — Epic, Task, Task-under-Epic, or
 * genuine Subtask — resolved from the board's own cached array (M28-A).
 *
 * The single place `TaskDetailModal` asks "what should this panel show":
 * the Subtasks section, the Epic Parent field, both, or neither. Each of the
 * three UI decisions reads one field off this object instead of repeating
 * `subtasks.ts`'s classification logic at each call site.
 */
export function useTodoHierarchy(todo: Todo): TodoHierarchy {
  const { data: todos = [] } = useTodos();

  return useMemo(() => {
    const parent = parentOf(todos, todo);

    return {
      todos,
      parent,
      isEpic: isEpic(todo),
      isGenuineSubtask: isGenuineSubtask(todos, todo),
      canHaveSubtasks: canHaveSubtasks(todos, todo),
      canPickEpicParent: canPickEpicParent(todos, todo),
    };
  }, [todos, todo]);
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
