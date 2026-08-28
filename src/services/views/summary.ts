import { DEFAULT_CATEGORY, type ColumnCategory } from "@/constants/columns";
import {
  PRIORITY_OPTIONS,
  toPriority,
  type Priority,
} from "@/constants/priorities";
import {
  WORK_TYPE_OPTIONS,
  toWorkType,
  type WorkType,
} from "@/constants/workTypes";
import type { IColumn, Todo } from "@/types/data";
import { dueStatus, todayISO, type DueStatus } from "@/utils/dueDate";

/**
 * What the board Summary counts, derived from the work items themselves.
 *
 * No stats table and no materialised view: a stored count can disagree with the
 * board. Everything here folds the array useVisibleTodos already returns, so the
 * Summary and the board header can't drift. If folding turns out to be slow,
 * profile the query rather than adding a counter.
 *
 * "Overdue" comes from dueStatus() in utils/dueDate.ts, the same call the card
 * chip and the `due` filter make. This module doesn't own a definition of late.
 */

/**
 * Which category each column belongs to, by column id. Doneness is the column's
 * category, never a field on the item, so counting done means resolving the
 * column first. Built once per render rather than looked up per item, which
 * would be O(items × columns).
 */
export function categoryIndex(columns: IColumn[]): Map<string, ColumnCategory> {
  return new Map(
    columns.map((column) => [
      column.id,
      (column.category as ColumnCategory | null) ?? DEFAULT_CATEGORY,
    ]),
  );
}

/**
 * The category a work item is in. Falls back to `todo` when the column is
 * missing, so `todo + inProgress + done === total` holds and the progress bar
 * can be trusted.
 */
function categoryOfTodo(
  todo: Todo,
  index: Map<string, ColumnCategory>,
): ColumnCategory {
  if (todo.column_id === null) return DEFAULT_CATEGORY;

  return index.get(todo.column_id) ?? DEFAULT_CATEGORY;
}

export type SummaryStats = {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  /**
   * Past its due date and not done. A finished task can't be late, and counting
   * it would make the number grow forever on a healthy board.
   */
  overdue: number;
  /** Due today and not done, by the same rule. */
  dueToday: number;
  /** Open items nobody owns. The one number here that is a prompt to act. */
  unassigned: number;
};

export function summaryStats(
  todos: Todo[],
  index: Map<string, ColumnCategory>,
  today: string,
): SummaryStats {
  const stats: SummaryStats = {
    total: todos.length,
    todo: 0,
    inProgress: 0,
    done: 0,
    overdue: 0,
    dueToday: 0,
    unassigned: 0,
  };

  for (const todo of todos) {
    const category = categoryOfTodo(todo, index);

    if (category === "done") stats.done += 1;
    else if (category === "in_progress") stats.inProgress += 1;
    else stats.todo += 1;

    if (category === "done") continue;

    if (todo.assignee_id === null) stats.unassigned += 1;

    if (todo.due_date !== null) {
      const status = dueStatus(todo.due_date, today);

      if (status === "overdue") stats.overdue += 1;
      else if (status === "today") stats.dueToday += 1;
    }
  }

  return stats;
}

/** One person's share of the open work. */
export type WorkloadEntry = {
  /** Null is the unassigned bucket, which is a real answer and not a gap. */
  assigneeId: string | null;
  open: number;
  overdue: number;
};

/**
 * Who is carrying what, over open items only. Done work isn't load — counting it
 * would rank the roster by tenure rather than by what's on their plate.
 *
 * Sorted by open count then id, so the order is stable between renders.
 */
export function workload(
  todos: Todo[],
  index: Map<string, ColumnCategory>,
  today: string,
): WorkloadEntry[] {
  const buckets = new Map<string | null, WorkloadEntry>();

  for (const todo of todos) {
    if (categoryOfTodo(todo, index) === "done") continue;

    const key = todo.assignee_id;

    let entry = buckets.get(key);

    if (!entry) {
      entry = { assigneeId: key, open: 0, overdue: 0 };
      buckets.set(key, entry);
    }

    entry.open += 1;

    if (
      todo.due_date !== null &&
      dueStatus(todo.due_date, today) === "overdue"
    ) {
      entry.overdue += 1;
    }
  }

  return [...buckets.values()].sort(
    (a, b) =>
      b.open - a.open || (a.assigneeId ?? "").localeCompare(b.assigneeId ?? ""),
  );
}

/**
 * How much has happened lately, and how much is about to.
 *
 * "Updated" means edited since it was created, not "touched": updated_at is set
 * by a trigger on UPDATE only, so an unchanged card carries null or its creation
 * instant. Comparing the two keeps a week of new cards from also reading as a
 * week of activity.
 *
 * Takes `now` rather than reading the clock, so it's testable without freezing
 * time.
 */
export type RecentCounts = {
  created: number;
  updated: number;
  /** Due inside the window and not done. An overdue item is not "due soon". */
  dueSoon: number;
};

export function recentCounts(
  todos: Todo[],
  index: Map<string, ColumnCategory>,
  now: Date,
  windowDays: number,
): RecentCounts {
  const since = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

  // Compared as calendar days: due_date denotes a day and has no time to
  // compare against. Building a Date would reintroduce the timezone shift
  // utils/dueDate.ts exists to avoid.
  const today = todayISO(now);
  const horizon = todayISO(new Date(now.getTime() + windowDays * 86_400_000));

  const counts: RecentCounts = { created: 0, updated: 0, dueSoon: 0 };

  for (const todo of todos) {
    const created = Date.parse(todo.created_at);

    if (!Number.isNaN(created) && created >= since) counts.created += 1;

    const updated = todo.updated_at ? Date.parse(todo.updated_at) : NaN;

    if (!Number.isNaN(updated) && updated > created && updated >= since) {
      counts.updated += 1;
    }

    if (
      todo.due_date !== null &&
      categoryOfTodo(todo, index) !== "done" &&
      todo.due_date >= today &&
      todo.due_date <= horizon
    ) {
      counts.dueSoon += 1;
    }
  }

  return counts;
}

/**
 * What is late and what is about to be, oldest deadline first.
 *
 * Open items only, and it calls dueStatus() rather than comparing itself, so
 * `overdue` means exactly what the card chip and the filter mean.
 *
 * `limit` is applied after sorting, so the widget shows the *most* urgent N
 * rather than whichever N came back first.
 */
export type DueSoonItem = { todo: Todo; status: DueStatus };

export function dueSoonItems(
  todos: Todo[],
  index: Map<string, ColumnCategory>,
  today: string,
  windowDays: number,
  limit: number,
): DueSoonItem[] {
  // Calendar-day arithmetic, same reason as recentCounts: due_date denotes a
  // day, so the horizon has to be one too.
  const horizon = todayISO(
    new Date(Date.parse(`${today}T00:00:00Z`) + windowDays * 86_400_000),
  );

  const items: DueSoonItem[] = [];

  for (const todo of todos) {
    if (todo.due_date === null) continue;
    if (categoryOfTodo(todo, index) === "done") continue;

    const status = dueStatus(todo.due_date, today);

    // Overdue is never filtered out by the horizon — something three weeks late
    // is more urgent than something due Friday, and dropping it would make this
    // the one place a late task is invisible.
    if (status !== "overdue" && todo.due_date.slice(0, 10) > horizon) continue;

    items.push({ todo, status });
  }

  return items
    .sort(
      (a, b) =>
        a.todo.due_date!.localeCompare(b.todo.due_date!) ||
        (a.todo.board_key ?? 0) - (b.todo.board_key ?? 0) ||
        a.todo.id.localeCompare(b.todo.id),
    )
    .slice(0, limit);
}

/** One slice of a breakdown: what it is, and how many. */
export type Slice<T> = { key: T; count: number };

/**
 * Work items per column, in the board's own column order.
 *
 * Per column, not per category: the board's statuses *are* its columns, so
 * collapsing "In Progress" and "In Review" into one bar would answer a question
 * the board doesn't ask.
 *
 * Empty columns are kept and items in no column count under `null`, so the
 * slices always sum to the total.
 */
export function statusDistribution(
  todos: Todo[],
  columns: IColumn[],
): Slice<string | null>[] {
  const counts = new Map<string | null, number>(
    columns.map((column) => [column.id, 0]),
  );

  for (const todo of todos) {
    const key =
      todo.column_id !== null && counts.has(todo.column_id)
        ? todo.column_id
        : null;

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const slices: Slice<string | null>[] = columns.map((column) => ({
    key: column.id,
    count: counts.get(column.id) ?? 0,
  }));

  const orphans = counts.get(null) ?? 0;

  if (orphans > 0) slices.push({ key: null, count: orphans });

  return slices;
}

/**
 * Work items per priority, in the menu's own order, unset last.
 *
 * PRIORITY_OPTIONS is the single ordering of the five levels, so a chart can't
 * disagree with a sorted list about which way is up. "No priority" is a slice
 * rather than an omission — most cards have none, and leaving it out would draw
 * a chart of a minority and call it the board.
 */
export function priorityDistribution(todos: Todo[]): Slice<Priority | null>[] {
  const counts = new Map<Priority | null, number>(
    PRIORITY_OPTIONS.map((option) => [option, 0]),
  );

  counts.set(null, 0);

  for (const todo of todos) {
    const key = toPriority(todo.priority);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...PRIORITY_OPTIONS, null].map((key) => ({
    key,
    count: counts.get(key) ?? 0,
  }));
}

/**
 * Work items per type, in the menu's own order.
 *
 * Every type is listed even at zero: the set is fixed at four and a board with
 * no bugs is a fact worth showing. WORK_TYPES has the same four members as the
 * CHECK constraint on todos.type.
 */
export function typeDistribution(todos: Todo[]): Slice<WorkType>[] {
  const counts = new Map<WorkType, number>(
    WORK_TYPE_OPTIONS.map((option) => [option, 0]),
  );

  for (const todo of todos) {
    const key = toWorkType(todo.type);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return WORK_TYPE_OPTIONS.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}
