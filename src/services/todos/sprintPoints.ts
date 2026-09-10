import type { IColumn, Todo } from "@/types/data";
import { doneColumnIds } from "./subtasks";

// null estimate stays out of `total` entirely rather than counting as 0 — see `unestimated` for how many were skipped
export interface PointsSummary {
  total: number;
  completed: number;
  remaining: number;
  unestimated: number;
  todo: number;
  inProgress: number;
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
