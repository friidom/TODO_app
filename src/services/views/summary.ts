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

// Everything here folds the same array useVisibleTodos returns — no stats table, so the Summary can't drift from the board.

export function categoryIndex(columns: IColumn[]): Map<string, ColumnCategory> {
  return new Map(
    columns.map((column) => [
      column.id,
      (column.category as ColumnCategory | null) ?? DEFAULT_CATEGORY,
    ]),
  );
}

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
  overdue: number;
  dueToday: number;
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

export type WorkloadEntry = {
  assigneeId: string | null;
  open: number;
  overdue: number;
};

// Open items only — counting done work would rank people by tenure, not by what's on their plate right now.
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

export type RecentCounts = {
  created: number;
  updated: number;
  dueSoon: number;
};

// updated_at is only set on UPDATE, so it's compared against created_at to tell "edited" from "just created".
export function recentCounts(
  todos: Todo[],
  index: Map<string, ColumnCategory>,
  now: Date,
  windowDays: number,
): RecentCounts {
  const since = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

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

export type DueSoonItem = { todo: Todo; status: DueStatus };

// limit is applied after sorting, so this shows the most urgent N, not whichever N came back first.
export function dueSoonItems(
  todos: Todo[],
  index: Map<string, ColumnCategory>,
  today: string,
  windowDays: number,
  limit: number,
): DueSoonItem[] {
  const horizon = todayISO(
    new Date(Date.parse(`${today}T00:00:00Z`) + windowDays * 86_400_000),
  );

  const items: DueSoonItem[] = [];

  for (const todo of todos) {
    if (todo.due_date === null) continue;
    if (categoryOfTodo(todo, index) === "done") continue;

    const status = dueStatus(todo.due_date, today);

    // overdue is never filtered by the horizon — something 3 weeks late still belongs here
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

export type Slice<T> = { key: T; count: number };

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
