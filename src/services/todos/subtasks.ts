import type { IColumn, Todo } from "@/types/data";

/**
 * The hierarchy, as pure functions over the array the board already holds
 * (M27).
 *
 * **No query lives here and none is needed.** `fetchTodos` returns every row
 * on the board, cards and subtasks alike, so "which rows are children of
 * KAN-9" and "how many of them are done" are folds over a cache entry that is
 * already loaded, already realtime-patched and already invalidated by every
 * mutation. That is the whole reason M27 chose to keep the fetch wide and
 * gate the *views* instead — see `fetchTodos`' own comment.
 *
 * Doneness is the child's column category, never a field on the row. That
 * rule predates this milestone (M2-15 deleted `todos.completed` for it) and
 * this module does not get to reinterpret it: a subtask is done when the
 * column it sits in is categorised `done`, exactly as a card is.
 */

/** A work item is a subtask when it names a parent. */
export function isSubtask(todo: Pick<Todo, "parent_id">): boolean {
  return todo.parent_id !== null;
}

/**
 * Whether this item may own subtasks — i.e. whether to offer "Add subtask".
 *
 * The inverse of `isSubtask`, named separately because it is a different
 * question with a different reason: the depth rule is two levels, so the
 * thing that stops a subtask growing children is the same fact that makes it
 * a subtask. Saying it in the caller as `!isSubtask(todo)` would read as a
 * coincidence rather than as the rule.
 *
 * The database enforces this regardless (`enforce_subtask_depth`); this is
 * what keeps the UI from offering a control whose write would be refused.
 */
export function canHaveSubtasks(todo: Pick<Todo, "parent_id">): boolean {
  return todo.parent_id === null;
}

/**
 * One task's children, oldest first.
 *
 * Ordered by `created_at` rather than by `rank`: subtasks have ranks because
 * every row does, but nothing orders them by one — there is no drag on this
 * list and no stored order to honour, so the honest ordering is the one the
 * user produced by adding them.
 *
 * Ties fall back to `id` so the order is total and a re-render cannot reshuffle
 * two subtasks created in the same millisecond.
 */
export function subtasksOf(todos: Todo[], parentId: string): Todo[] {
  return todos
    .filter((todo) => todo.parent_id === parentId)
    .sort(
      (a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
        a.id.localeCompare(b.id),
    );
}

/** Every top-level card — what the board, list, calendar and timeline show. */
export function topLevelTodos(todos: Todo[]): Todo[] {
  return todos.filter((todo) => todo.parent_id === null);
}

export interface SubtaskProgress {
  done: number;
  total: number;
  /** 0–100, and 0 when there is nothing to divide by. */
  percent: number;
}

export const NO_SUBTASKS: SubtaskProgress = { done: 0, total: 0, percent: 0 };

/**
 * The ids of every column that means "done".
 *
 * Built once by the caller and passed to `subtaskProgress`, rather than
 * looked up per subtask: a board has a handful of columns and a task may have
 * many children, and resolving the same three ids per row is the shape that
 * turns a count into a nested loop.
 */
export function doneColumnIds(columns: IColumn[]): Set<string> {
  return new Set(
    columns.filter((column) => column.category === "done").map((c) => c.id),
  );
}

/**
 * How many of these subtasks are finished.
 *
 * `percent` is guarded against the empty case rather than left to produce
 * `NaN` — the same `heaviest === 0 ? 0 : …` care `Breakdowns.tsx` takes, and
 * the reason a task with no children renders a `0%` bar instead of an empty
 * `style="width: NaN%"`.
 */
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

/**
 * Progress for every parent on the board, in one pass.
 *
 * What the card indicator reads. Built once per board render and looked up by
 * id, because the alternative — each card filtering the whole array for its
 * own children — is O(cards × rows) on a surface that re-renders on every
 * pointer move during a drag.
 *
 * Parents with no children are absent from the map rather than present with a
 * zero: "no subtasks" and "no subtasks done" are different states, and only
 * the second one should draw an indicator.
 */
export function subtaskProgressByParent(
  todos: Todo[],
  columns: IColumn[],
): Map<string, SubtaskProgress> {
  const doneColumns = doneColumnIds(columns);
  const counts = new Map<string, { done: number; total: number }>();

  for (const todo of todos) {
    if (todo.parent_id === null) continue;

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
