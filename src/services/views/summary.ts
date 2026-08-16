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
import { dueStatus, todayISO } from "@/utils/dueDate";

/**
 * What the board Summary counts, derived from the work items themselves (M18).
 *
 * **No `board_stats` table, no materialised view, no second task system** — the
 * plan states this as a decision rather than an implementation detail, and the
 * reason is that a stored count can disagree with the board. Everything here is
 * a fold over the array `useVisibleTodos` already returns, which is the same
 * array the Board and the List render. A number on the Summary tab and the
 * number in the board header cannot drift, because there is one source.
 *
 * **Board-scoped by construction, not by discipline.** None of these functions
 * fetches anything: they take the array they are given. The Summary hands them
 * `useVisibleTodos()`, which defaults to `{ kind: "board", boardId }` — so the
 * only way to summarise more than one board would be to pass a wider scope
 * deliberately, and nothing does.
 *
 * If folding turns out to be slow, that is PH-03's trigger — profile the query,
 * do not add a counter.
 *
 * **"Overdue" means exactly one thing.** It comes from `dueStatus()` in
 * `utils/dueDate.ts`, the same function the card chip and the `due` filter
 * call. A dashboard that disagrees with the board about which task is late is
 * worse than no dashboard, so this module does not own a definition of late —
 * it borrows the only one.
 *
 * Pure, and therefore in `services/` beside `scope.ts` and `view.ts` rather
 * than inside the widgets: the branches here are worth a test, and
 * `summary.test.ts` is it.
 */

/**
 * Which category each column belongs to, by column id.
 *
 * Doneness is the column's `category`, never a field on the work item (M2), so
 * counting done items means resolving each item's column first. Built once per
 * render from the scoped column query and passed in, rather than looked up per
 * item — the alternative is O(items × columns).
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
 * The category a work item is in.
 *
 * Falls back to `todo` for an item whose column is missing — either the column
 * query has not resolved yet, or the item is in no column at all. Counting it
 * as "todo" rather than dropping it keeps `todo + inProgress + done === total`,
 * which is what lets the progress bar be trusted.
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
   * Past its due date and **not done**.
   *
   * A finished task cannot be late — it was delivered, whenever that was — and
   * counting it would make the number grow forever on a healthy board, which is
   * the failure mode that makes a dashboard get ignored.
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
 * Who is carrying what, over **open** items only.
 *
 * Done work is not load — a person who finished forty tasks is not busier than
 * one who finished none, and counting completed items would rank the roster by
 * tenure instead of by what is on their plate this week.
 *
 * Sorted by open count descending, then by id, so the order is stable between
 * renders rather than depending on the order items came back in.
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
 * Three counts over one window, because the Summary's top row asks the same
 * question three ways: what arrived, what moved, what is coming.
 *
 * **"Updated" means edited since it was created**, not "touched". `updated_at`
 * is set by the M2-04 trigger on UPDATE only, so a card nobody has changed
 * either carries null or carries its creation instant — comparing the two is
 * what keeps a week of new cards from also reading as a week of activity, and
 * it is correct whichever of those two shapes the row has.
 *
 * Pure, so it takes `now` rather than reading the clock: a function that reads
 * the clock cannot be tested without freezing time. Same rule `relativeTime`
 * and `dueStatus` follow.
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

  // Compared as calendar days, because `due_date` is a `date` and has no time
  // to compare against — the same reason `dueStatus` slices an ISO string
  // rather than constructing a Date. Building one here would reintroduce the
  // timezone shift M5-04 exists to avoid.
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

/** One slice of a breakdown: what it is, and how many. */
export type Slice<T> = { key: T; count: number };

/**
 * Work items per column, in the board's own column order.
 *
 * **Per column, not per category.** The board's statuses *are* its columns —
 * that is the M2 decision that removed `todos.completed` — so a status chart
 * that collapsed "In Progress" and "In Review" into one bar would be answering
 * a question the board does not ask. Categories are how a column is coloured,
 * not what it is called.
 *
 * Empty columns are kept. A column with nothing in it is part of the board's
 * shape whether or not anything is in it, and a status overview that silently
 * dropped it would misreport the board — the same rule `groupTodos` applies.
 *
 * Items in no column at all are counted under `null`, so the slices always sum
 * to the total and the chart can be trusted.
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
 * `PRIORITY_OPTIONS` is the single ordering of the five levels — the same array
 * the sort and the group read — so a chart cannot disagree with a sorted list
 * about which way is up.
 *
 * "No priority" is a slice rather than an omission: `todos.priority` is
 * nullable and most cards have none, so leaving it out would draw a chart of a
 * minority and call it the board.
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
 * Every type is listed even at zero, because the set is fixed at four and a
 * board with no bugs is a fact worth showing rather than a row to hide. There
 * is no Epic here and none is invented — `WORK_TYPES` has four members and the
 * CHECK constraint on `todos.type` has the same four.
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
