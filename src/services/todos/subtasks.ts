import type { IColumn, Todo } from "@/types/data";

/**
 * The hierarchy, as pure functions over the array the board already holds
 * (M27, widened for Epics in M28-A).
 *
 * **No query lives here and none is needed.** `fetchTodos` returns every row
 * on the board — Epics, Tasks and Subtasks alike — so "which rows are
 * children of KAN-9" and "how many of them are done" are folds over a cache
 * entry that is already loaded, already realtime-patched and already
 * invalidated by every mutation. That is the whole reason M27 chose to keep
 * the fetch wide and gate the *views* instead — see `fetchTodos`' own
 * comment.
 *
 * **A row's role — Epic, a top-level Task, a Task under an Epic, or a
 * Subtask — is never stored.** It is derived here, on demand, from the row's
 * own `type` and its parent's `type`: the same two facts
 * `enforce_work_item_hierarchy` reads in the database. Storing a role would
 * be a second thing to keep in sync with `parent_id` by hand; deriving it in
 * one place is what keeps the client and the trigger reading the same rule
 * off the same two columns.
 *
 * Doneness is the child's column category, never a field on the row. That
 * rule predates this milestone (M2-15 deleted `todos.completed` for it) and
 * this module does not get to reinterpret it: a subtask is done when the
 * column it sits in is categorised `done`, exactly as a card is.
 */

/** A work item is an Epic when its own type says so — the one role that
 * does not depend on looking at anything else. */
export function isEpic(todo: Pick<Todo, "type">): boolean {
  return todo.type === "Epic";
}

/**
 * A todo's parent, resolved from the board's own array.
 *
 * `null` for a root item AND for a parent the array does not (yet) hold —
 * the two are indistinguishable from here, which is why every caller of this
 * function treats "no parent found" as "assume top level" rather than as an
 * error: a transient cache gap must never read as an invalid hierarchy.
 */
export function parentOf(
  todos: Todo[],
  todo: Pick<Todo, "parent_id">,
): Todo | null {
  if (todo.parent_id === null) return null;

  return todos.find((candidate) => candidate.id === todo.parent_id) ?? null;
}

/**
 * A work item is a genuine Subtask when its parent is a Task, not an Epic.
 *
 * **Not simply "has a parent".** A row parented by an Epic occupies the Task
 * position in this hierarchy — it is a Task *under* that Epic, not a
 * Subtask — and every rule that means "is this a Subtask" (whether it may
 * have children, whether it may pick an Epic, whether the board should hide
 * it) has to ask this question, not `todo.parent_id !== null` alone.
 */
export function isGenuineSubtask(todos: Todo[], todo: Todo): boolean {
  const parent = parentOf(todos, todo);

  return parent !== null && !isEpic(parent);
}

/**
 * Whether this item may own subtasks — i.e. whether to offer "Add subtask".
 *
 * True for an unparented Task and for a Task under an Epic alike — both
 * occupy the Task position, and the hierarchy's third level (Subtask) hangs
 * off either. False for an Epic (which contains Tasks, never Subtasks
 * directly) and false for a genuine Subtask (which cannot have children at
 * all — M27's two-level rule, unchanged at the leaf).
 *
 * The database enforces this regardless (`enforce_work_item_hierarchy`);
 * this is what keeps the UI from offering a control whose write would be
 * refused.
 */
export function canHaveSubtasks(todos: Todo[], todo: Todo): boolean {
  if (isEpic(todo)) return false;

  return !isGenuineSubtask(todos, todo);
}

/**
 * Whether this item may pick an Epic as its parent — i.e. whether to show
 * the Parent field at all (M28-A).
 *
 * False for an Epic itself (an Epic never has a parent) and false for a
 * genuine Subtask (a Subtask's parent is always its Task, shown as the M27
 * breadcrumb instead — a Subtask cannot select an Epic). True for every
 * other row: an unparented Task can gain one, and a Task already under an
 * Epic can be shown its current one or moved to a different one.
 */
export function canPickEpicParent(todos: Todo[], todo: Todo): boolean {
  if (isEpic(todo)) return false;

  return !isGenuineSubtask(todos, todo);
}

/**
 * One work item's children, oldest first.
 *
 * Generic over what the parent IS — a Task's Subtasks and an Epic's Tasks
 * are both "rows whose `parent_id` names this one", the identical query
 * answered once rather than twice, which is the whole reason M28-A did not
 * need a second relationship mechanism to add a second kind of container.
 *
 * Ordered by `created_at` rather than by `rank`: children have ranks because
 * every row does, but nothing orders them by one — there is no drag on this
 * list and no stored order to honour, so the honest ordering is the one the
 * user produced by adding them.
 *
 * Ties fall back to `id` so the order is total and a re-render cannot
 * reshuffle two children created in the same millisecond.
 */
export function childrenOf(todos: Todo[], parentId: string): Todo[] {
  return todos
    .filter((todo) => todo.parent_id === parentId)
    .sort(
      (a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
        a.id.localeCompare(b.id),
    );
}

/** Every Epic on the board, for the Parent selector's candidate list. */
export function epicsOf(todos: Todo[]): Todo[] {
  return todos.filter(isEpic);
}

/**
 * Whether a row must never appear as a card — the board, list, calendar,
 * timeline and summary all hide exactly this set (M27, widened for Epics).
 *
 * **Not "has a parent".** An Epic has none and is shown; a Task under an
 * Epic has one and is *also* shown — it is a real card in a real column,
 * just organised under an Epic, and hiding it would make "assign this task
 * to an epic" delete it from the board. Only a genuine Subtask — parented by
 * a Task, not an Epic — is hidden, which is `isGenuineSubtask` exactly.
 *
 * Looks the parent up by id in a `Map` built once by the caller rather than
 * with `Array.find` per row, so filtering a board of N rows stays O(N)
 * instead of O(N²) — the same concern `subtaskProgressByParent` was already
 * written to avoid.
 */
function isHiddenSubtask(todo: Todo, byId: Map<string, Todo>): boolean {
  if (todo.parent_id === null) return false;

  const parent = byId.get(todo.parent_id);

  // Parent not (yet) in the array: default to visible. A transient cache gap
  // must never silently remove a real card from the board.
  return parent !== undefined && !isEpic(parent);
}

/** Every card the board, list, calendar and timeline should show. */
export function topLevelTodos(todos: Todo[]): Todo[] {
  const byId = new Map(todos.map((todo) => [todo.id, todo]));

  return todos.filter((todo) => !isHiddenSubtask(todo, byId));
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
 * Progress for every Task on the board that has Subtasks, in one pass.
 *
 * What the card indicator reads. Built once per board render and looked up by
 * id, because the alternative — each card filtering the whole array for its
 * own children — is O(cards × rows) on a surface that re-renders on every
 * pointer move during a drag.
 *
 * **Epics are excluded from this map on purpose, even though they have
 * children too.** The plan defers an Epic's own progress bar to M31 — this
 * function is specifically "how many Subtasks does this Task have", so a row
 * only enters the count when its parent is *not* an Epic; a Task assigned to
 * an Epic still counts toward that Task's own Subtask progress, it simply
 * does not also count toward the Epic's.
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
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  const counts = new Map<string, { done: number; total: number }>();

  for (const todo of todos) {
    if (todo.parent_id === null) continue;

    const parent = byId.get(todo.parent_id);

    // Unknown parent (transient cache gap) or an Epic parent: not a
    // Task→Subtask relationship, so it does not feed this indicator.
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

/**
 * Progress for every Epic on the board, counting its own Tasks (M28-B) — the
 * Timeline's group header badge, not the board card's subtask indicator.
 *
 * **The mirror image of `subtaskProgressByParent`.** That one excludes a
 * child whose parent is an Epic, because a Task under an Epic is not a
 * Subtask and does not belong in a Task's own subtask count. This function
 * exists *for* that excluded relationship: an Epic's progress is "how many of
 * its Tasks are done", the identical done-column rule, counted over the one
 * set of rows the other function deliberately skips. Kept as its own small
 * function rather than a shared parametrised helper — the two answer
 * different questions for different UI, and three similar lines are cheaper
 * to read than a fourth argument threading the difference through one.
 *
 * Counts every child, dated or not: completion is a status question — which
 * column a card sits in — and has nothing to do with whether that card has
 * been scheduled on the Timeline yet.
 */
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

    // Unknown parent (transient cache gap), or a parent that is not an Epic:
    // not an Epic→Task relationship, so it does not feed this badge.
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
