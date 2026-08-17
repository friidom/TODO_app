import type { Todo } from "@/types/data";
import { todayISO } from "@/utils/dueDate";

/**
 * How much work arrived and how much was touched, per day (M18 polish).
 *
 * **Two series, and the third one people ask for does not exist.** The obvious
 * chart is created / updated / *completed*, and completed is the one that cannot
 * be drawn honestly:
 *
 * - Doneness is derived from the column a card currently sits in (M2's rule —
 *   `todos.completed` was removed and there is no `completed_at`), so no row
 *   records *when* it was finished. The only timestamp a done card carries is
 *   `updated_at`, which moves on any edit; charting it would report a card
 *   retitled yesterday as completed yesterday.
 * - The board's history does record transitions — `activities` holds a
 *   `todo.moved` row per move — but that table is fetched newest-first with
 *   `ACTIVITY_PAGE = 50`, so any window older than the last page silently reads
 *   as zero. A series that is right only on quiet boards is the same lie with
 *   extra steps.
 *
 * **What would make it possible:** a `completed_at` column maintained by a
 * trigger, or a date-bounded aggregate query over `activities`. Both are schema
 * or query work, and neither belongs in a presentation pass.
 *
 * **`updated` uses the same rule as the KPI strip**, which is `updated_at >
 * created_at` — a row nobody has touched carries its creation instant in
 * `updated_at`, and counting it would draw the created series twice.
 *
 * **The honest caveat, recorded where the data is:** `updated_at` holds only the
 * *most recent* change, so this series counts items whose latest edit fell on a
 * given day. An item edited on Monday and again on Friday appears once, on
 * Friday. The series therefore leans toward today, and it answers "what was
 * touched last on each day" rather than "how many edits happened each day".
 * Counting edits properly needs the activity log, which is capped as above.
 *
 * **Local days, deliberately — the opposite of `due_date`'s rule.** A due date
 * is a calendar day the user typed and must never be converted; `created_at` and
 * `updated_at` are genuine instants, so "which day did this happen" is a
 * question about the reader's own timezone. `todayISO` does that conversion,
 * once.
 *
 * Pure: takes `now`, never reads the clock. Always returns exactly `days`
 * points, oldest first, so a quiet board draws a flat line rather than a short
 * one — a chart whose width depends on its data cannot be compared with itself.
 */
export type TrendPoint = {
  /** `YYYY-MM-DD`, local. */
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

    // `updated > created` is `recentCounts`' rule, and it is what keeps a week
    // of new cards from also reading as a week of edits. NaN on either side
    // fails the comparison, which is the wanted answer for an unparseable row.
    if (!Number.isNaN(updated) && updated > created) {
      const at = index.get(todayISO(new Date(updated)));

      if (at !== undefined) points[at].updated += 1;
    }
  }

  return points;
}

/**
 * The value the chart's y axis tops out at.
 *
 * Shared across both series so they are drawn against one scale — two series on
 * two scales is a chart that invites exactly the comparison it cannot support.
 * Never below 1, because a board with no activity would otherwise divide by
 * zero, and a flat line along the floor is the honest picture of a quiet week.
 */
export function trendPeak(points: TrendPoint[]): number {
  return Math.max(
    1,
    ...points.map((point) => Math.max(point.created, point.updated)),
  );
}
