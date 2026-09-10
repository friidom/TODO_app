import type { Todo } from "@/types/data";
import { todayISO } from "@/utils/dueDate";

// No "completed" series — doneness is derived from the column a card sits in, and there's no completed_at to chart.
// updated_at only holds the latest edit, so this counts "what was touched last on each day", not every edit.
export type TrendPoint = {
  day: string;
  created: number;
  updated: number;
};

export function activityTrend(
  todos: Todo[],
  now: Date,
  days: number,
): TrendPoint[] {
  const points: TrendPoint[] = [];
  const index = new Map<string, number>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = todayISO(new Date(now.getTime() - i * 86_400_000));

    index.set(day, points.length);
    points.push({ day, created: 0, updated: 0 });
  }

  for (const todo of todos) {
    const created = Date.parse(todo.created_at);

    if (!Number.isNaN(created)) {
      const at = index.get(todayISO(new Date(created)));

      if (at !== undefined) points[at].created += 1;
    }

    const updated = todo.updated_at ? Date.parse(todo.updated_at) : NaN;

    // updated > created keeps a week of new cards from also reading as a week of edits.
    if (!Number.isNaN(updated) && updated > created) {
      const at = index.get(todayISO(new Date(updated)));

      if (at !== undefined) points[at].updated += 1;
    }
  }

  return points;
}

// never below 1, so a quiet board doesn't divide by zero
export function trendPeak(points: TrendPoint[]): number {
  return Math.max(
    1,
    ...points.map((point) => Math.max(point.created, point.updated)),
  );
}
