import {
  sprintPoints,
  type PointsSummary,
} from "@/services/todos/sprintPoints";
import {
  NO_SUBTASKS,
  epicTaskProgress,
  isEpic,
  type SubtaskProgress,
} from "@/services/todos/subtasks";
import { doneStatusIds, isDoneIn } from "@/services/workflow/statuses";
import type { IStatus, Sprint, Todo } from "@/types/data";
import { dueStatus, toCalendarDay } from "@/utils/dueDate";

export interface SprintEpic {
  epic: Todo;
  progress: SubtaskProgress;
}

export interface SprintInsights {
  total: number;
  done: number;
  inProgress: number;
  notStarted: number;
  // The three always add up to 100 once there is anything in the sprint, so the stacked bar has no gap or overflow.
  donePercent: number;
  inProgressPercent: number;
  notStartedPercent: number;
  // Not done and past due, most overdue first.
  overdue: Todo[];
  // The Epics this sprint's work sits under, with each Epic's whole progress rather than just this sprint's share.
  epics: SprintEpic[];
  points: PointsSummary;
}

// Same classification SprintDetails always used: in review is still being worked on, and a card with no status has not started.
export function sprintInsights(
  todos: Todo[],
  sprintId: string,
  statuses: IStatus[],
  today: string,
): SprintInsights {
  const items = todos.filter((todo) => todo.sprint_id === sprintId);
  const categoryOf = new Map(
    statuses.map((status) => [status.id, status.category]),
  );

  let done = 0;
  let inProgress = 0;

  const overdue: Todo[] = [];

  for (const item of items) {
    const category =
      item.status_id === null ? undefined : categoryOf.get(item.status_id);

    if (category === "done") {
      done += 1;
      continue;
    }

    if (category === "in_progress" || category === "in_review") {
      inProgress += 1;
    }

    if (
      item.due_date !== null &&
      dueStatus(item.due_date, today) === "overdue"
    ) {
      overdue.push(item);
    }
  }

  overdue.sort(
    (a, b) =>
      toCalendarDay(a.due_date ?? "").localeCompare(
        toCalendarDay(b.due_date ?? ""),
      ) || a.id.localeCompare(b.id),
  );

  const total = items.length;
  const notStarted = total - done - inProgress;

  const donePercent = total === 0 ? 0 : Math.round((done / total) * 100);
  const inProgressPercent =
    total === 0 ? 0 : Math.round((inProgress / total) * 100);

  return {
    total,
    done,
    inProgress,
    notStarted,
    donePercent,
    inProgressPercent,
    notStartedPercent:
      total === 0 ? 0 : Math.max(100 - donePercent - inProgressPercent, 0),
    overdue,
    epics: epicsOfSprint(todos, items, statuses),
    points: sprintPoints(items, statuses),
  };
}

function epicsOfSprint(
  todos: Todo[],
  items: Todo[],
  statuses: IStatus[],
): SprintEpic[] {
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  const progress = epicTaskProgress(todos, statuses);
  const seen = new Set<string>();
  const epics: SprintEpic[] = [];

  for (const item of items) {
    const parent =
      item.parent_id === null ? undefined : byId.get(item.parent_id);

    if (!parent || !isEpic(parent) || seen.has(parent.id)) continue;

    seen.add(parent.id);
    epics.push({
      epic: parent,
      progress: progress.get(parent.id) ?? NO_SUBTASKS,
    });
  }

  return epics;
}

// Whole days between the two calendar dates, so "ends today" is 0 rather than a
// rounding artefact of the clock time in either value.
export function daysLeft(end: string | null, today: string): number | null {
  if (!end) return null;

  const ms =
    Date.parse(`${end.slice(0, 10)}T00:00:00Z`) -
    Date.parse(`${today.slice(0, 10)}T00:00:00Z`);

  return Number.isNaN(ms) ? null : Math.round(ms / 86400000);
}

export interface SprintBurndown {
  // Points when anything in the sprint is estimated, otherwise one per work item, so an unestimated board still burns down.
  unit: "points" | "items";
  total: number;
  done: number;
  // Every calendar day from the sprint's start to its end or today, whichever is later.
  days: string[];
  // Work left at the end of each day, through today; the days after today have no value yet.
  remaining: number[];
  endIndex: number | null;
  todayIndex: number | null;
}

// Estimates are decimals, and a sum of them can carry binary noise (0.1 + 0.2) that should never reach the screen.
export function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

const DAY_MS = 86_400_000;

// A sprint left running for more than a year is drawn for its first year only.
const MAX_DAYS = 366;

function dayOffset(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

// Scope is the sprint as it is now — nothing records what was added or removed along the way — and a card counts as
// burnt down on the day its completed_at says, for as long as it stays done. Null without a start date to draw from.
export function sprintBurndown(
  todos: Todo[],
  sprint: Pick<Sprint, "id" | "start_date" | "end_date">,
  statuses: IStatus[],
  today: string,
): SprintBurndown | null {
  if (!sprint.start_date) return null;

  const start = toCalendarDay(sprint.start_date);
  const end = sprint.end_date ? toCalendarDay(sprint.end_date) : null;
  const last = [end ?? start, today].reduce(
    (latest, day) => (day > latest ? day : latest),
    start,
  );

  const days = Array.from(
    { length: Math.min(dayOffset(start, last), MAX_DAYS - 1) + 1 },
    (_, index) => addDays(start, index),
  );

  const items = todos.filter((todo) => todo.sprint_id === sprint.id);
  const unit = items.some((todo) => (todo.estimate ?? 0) > 0)
    ? "points"
    : "items";
  const counted =
    unit === "points" ? items.filter((todo) => todo.estimate !== null) : items;
  const weightOf = (todo: Todo) =>
    unit === "points" ? (todo.estimate ?? 0) : 1;

  const doneIds = doneStatusIds(statuses);

  const completions = counted
    .filter((todo) => isDoneIn(todo, doneIds))
    .map((todo) => ({
      // a done card with no stamp has nothing to place it by, so it counts as done from the first day
      day: todo.completed_at ? toCalendarDay(todo.completed_at) : start,
      weight: weightOf(todo),
    }));

  const total = counted.reduce((sum, todo) => sum + weightOf(todo), 0);
  const done = completions.reduce((sum, item) => sum + item.weight, 0);

  const todayIndex =
    today < start || today > days[days.length - 1]
      ? null
      : dayOffset(start, today);

  const through = today < start ? 0 : (todayIndex ?? days.length - 1) + 1;

  const remaining = days
    .slice(0, through)
    .map((day) =>
      roundPoints(
        total -
          completions.reduce(
            (sum, item) => (item.day <= day ? sum + item.weight : sum),
            0,
          ),
      ),
    );

  return {
    unit,
    total: roundPoints(total),
    done: roundPoints(done),
    days,
    remaining,
    endIndex:
      end !== null && end >= start
        ? Math.min(dayOffset(start, end), days.length - 1)
        : null,
    todayIndex,
  };
}
