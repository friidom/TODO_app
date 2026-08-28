import type { IColumn, Todo } from "@/types/data";
import { doneColumnIds } from "./subtasks";

/**
 * Story point rollups for a Sprint (M30) — reads `todos.estimate` (M24),
 * introduces no field of its own.
 *
 * **`null` is not `0`, carried through.** M24's own rule for the column is
 * that unestimated and estimated-at-zero are different facts, and a sum that
 * silently treats an unestimated item as zero would report a fully-estimated
 * sprint that is actually half guessed. So an unestimated item contributes
 * nothing to `total` — the sum only ever adds a real number — and
 * `unestimated` counts how many items that was true for, so the UI can say
 * "12 points · 3 unestimated" rather than a confident-looking total that
 * quietly excluded a third of the sprint.
 *
 * **Completion is the column's category, never a field** — the one
 * definition of doneness this schema has ever had (M2-15), the same rule
 * `subtaskProgress` already applies to a Task's Subtasks. `doneColumnIds` is
 * reused unchanged rather than re-deriving "which columns count as done".
 */
export interface PointsSummary {
  /** Sum of every estimated item's points. Unestimated items are not in
   * this sum at all — see the module doc on why that is not the same as
   * treating them as zero. */
  total: number;
  /** Sum of the points belonging to items in a done-category column. */
  completed: number;
  /** `total - completed`. Never negative — a card cannot un-ship itself. */
  remaining: number;
  /** How many items in this set have no estimate — the number the "12
   * points" headline is silently missing. */
  unestimated: number;
  /** Sum for items in a 'todo'-category column, or no column at all — not
   * yet on the Board is still "not started" (M31, the Jira reference's gray
   * count). */
  todo: number;
  /** Sum for items in an 'in_progress'-category column (the blue count). */
  inProgress: number;
  /** Identical to `completed` — the same sum, named to sit alongside `todo`
   * and `inProgress` as the third of one family rather than reading as a
   * fourth, differently-named thing (the green count). */
  done: number;
}

export const EMPTY_POINTS: PointsSummary = {
  total: 0,
  completed: 0,
  remaining: 0,
  unestimated: 0,
  todo: 0,
  inProgress: 0,
  done: 0,
};

export function sprintPoints(
  items: Todo[],
  columns: IColumn[],
): PointsSummary {
  const doneColumns = doneColumnIds(columns);
  const inProgressColumns = new Set(
    columns
      .filter((column) => column.category === "in_progress")
      .map((column) => column.id),
  );

  let total = 0;
  let completed = 0;
  let unestimated = 0;
  let todo = 0;
  let inProgress = 0;

  for (const item of items) {
    if (item.estimate === null) {
      unestimated += 1;
      continue;
    }

    total += item.estimate;

    if (item.column_id !== null && doneColumns.has(item.column_id)) {
      completed += item.estimate;
    } else if (item.column_id !== null && inProgressColumns.has(item.column_id)) {
      inProgress += item.estimate;
    } else {
      // No column, or a 'todo'-category one — not started either way.
      todo += item.estimate;
    }
  }

  return {
    total,
    completed,
    remaining: total - completed,
    unestimated,
    todo,
    inProgress,
    done: completed,
  };
}
