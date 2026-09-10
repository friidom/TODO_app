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

// no query of its own — folds over the board's already-cached todos, so it's instant and updates for free with every other write
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

// same fold as useSubtasks, kept separate since an Epic's Tasks don't carry a done/total count
export function useEpicTasks(epicId: string) {
  const { data: todos = [], isPending, error } = useTodos();

  const tasks = useMemo(() => childrenOf(todos, epicId), [todos, epicId]);

  return { tasks, isPending, error };
}

export function useEpics() {
  const { data: todos = [], isPending, error } = useTodos();

  const epics = useMemo(() => epicsOf(todos), [todos]);

  return { epics, isPending, error };
}

export interface TodoHierarchy {
  todos: Todo[];
  parent: Todo | null;
  isEpic: boolean;
  // parented by a Task, not an Epic
  isGenuineSubtask: boolean;
  canHaveSubtasks: boolean;
  canPickEpicParent: boolean;
}

// the one place TaskDetailModal asks "what should this panel show" instead of repeating subtasks.ts's classification per call site
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

// computed once and looked up by id, not per-card — the board re-renders on every pointer move during a drag
export function useSubtaskProgressByParent(): Map<string, SubtaskProgress> {
  const { data: todos = [] } = useTodos();
  const { data: columns = EMPTY_COLUMNS } = useColumns();

  return useMemo(
    () => subtaskProgressByParent(todos, columns),
    [todos, columns],
  );
}
