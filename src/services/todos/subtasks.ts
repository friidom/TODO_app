import type { IColumn, Todo } from "@/types/data";

export function isEpic(todo: Pick<Todo, "type">): boolean {
  return todo.type === "Epic";
}

// null covers both "root item" and "parent not loaded yet" — callers treat both as top level, never as an error.
export function parentOf(
  todos: Todo[],
  todo: Pick<Todo, "parent_id">,
): Todo | null {
  if (todo.parent_id === null) return null;

  return todos.find((candidate) => candidate.id === todo.parent_id) ?? null;
}

// not just "has a parent" — a row under an Epic is a Task, not a Subtask.
export function isGenuineSubtask(todos: Todo[], todo: Todo): boolean {
  const parent = parentOf(todos, todo);

  return parent !== null && !isEpic(parent);
}

export function canHaveSubtasks(todos: Todo[], todo: Todo): boolean {
  if (isEpic(todo)) return false;

  return !isGenuineSubtask(todos, todo);
}

export function canPickEpicParent(todos: Todo[], todo: Todo): boolean {
  if (isEpic(todo)) return false;

  return !isGenuineSubtask(todos, todo);
}

export function childrenOf(todos: Todo[], parentId: string): Todo[] {
  return todos
    .filter((todo) => todo.parent_id === parentId)
    .sort(
      (a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
        a.id.localeCompare(b.id),
    );
}

export function epicsOf(todos: Todo[]): Todo[] {
  return todos.filter(isEpic);
}

function isHiddenSubtask(todo: Todo, byId: Map<string, Todo>): boolean {
  if (todo.parent_id === null) return false;

  const parent = byId.get(todo.parent_id);

  // unknown parent (cache gap) defaults to visible — never silently drop a real card
  return parent !== undefined && !isEpic(parent);
}

export function topLevelTodos(todos: Todo[]): Todo[] {
  const byId = new Map(todos.map((todo) => [todo.id, todo]));

  return todos.filter((todo) => !isHiddenSubtask(todo, byId));
}

export interface SubtaskProgress {
  done: number;
  total: number;
  percent: number;
}

export const NO_SUBTASKS: SubtaskProgress = { done: 0, total: 0, percent: 0 };

export function doneColumnIds(columns: IColumn[]): Set<string> {
  return new Set(
    columns.filter((column) => column.category === "done").map((c) => c.id),
  );
}

export function subtaskProgress(
  subtasks: Todo[],
  doneColumns: Set<string>,
): SubtaskProgress {
  const total = subtasks.length;

  if (total === 0) return NO_SUBTASKS;

  const done = subtasks.filter(
    (todo) => todo.column_id !== null && doneColumns.has(todo.column_id),
  ).length;

  return { done, total, percent: Math.round((done / total) * 100) };
}

// Built once and looked up by id — one card filtering the whole board per render would be O(cards × rows).
export function subtaskProgressByParent(
  todos: Todo[],
  columns: IColumn[],
): Map<string, SubtaskProgress> {
  const doneColumns = doneColumnIds(columns);
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  const counts = new Map<string, { done: number; total: number }>();

  for (const todo of todos) {
    if (todo.parent_id === null) continue;

    const parent = byId.get(todo.parent_id);

    // a Task under an Epic isn't a Subtask, so it doesn't feed this indicator
    if (parent === undefined || isEpic(parent)) continue;

    const entry = counts.get(todo.parent_id) ?? { done: 0, total: 0 };

    entry.total += 1;

    if (todo.column_id !== null && doneColumns.has(todo.column_id)) {
      entry.done += 1;
    }

    counts.set(todo.parent_id, entry);
  }

  const progress = new Map<string, SubtaskProgress>();

  for (const [parentId, { done, total }] of counts) {
    progress.set(parentId, {
      done,
      total,
      percent: Math.round((done / total) * 100),
    });
  }

  return progress;
}

// Mirror of subtaskProgressByParent, for Epics counting their own Tasks instead.
export function epicTaskProgress(
  todos: Todo[],
  columns: IColumn[],
): Map<string, SubtaskProgress> {
  const doneColumns = doneColumnIds(columns);
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  const counts = new Map<string, { done: number; total: number }>();

  for (const todo of todos) {
    if (todo.parent_id === null) continue;

    const parent = byId.get(todo.parent_id);

    if (parent === undefined || !isEpic(parent)) continue;

    const entry = counts.get(todo.parent_id) ?? { done: 0, total: 0 };

    entry.total += 1;

    if (todo.column_id !== null && doneColumns.has(todo.column_id)) {
      entry.done += 1;
    }

    counts.set(todo.parent_id, entry);
  }

  const progress = new Map<string, SubtaskProgress>();

  for (const [epicId, { done, total }] of counts) {
    progress.set(epicId, {
      done,
      total,
      percent: Math.round((done / total) * 100),
    });
  }

  return progress;
}
