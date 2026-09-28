import type { IStatus, Todo } from "@/types/data";

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
  statuses: IStatus[],
): PointsSummary {
  const categoryOf = new Map(statuses.map((status) => [status.id, status.category]));

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

    const category = item.status_id === null ? undefined : categoryOf.get(item.status_id);

    if (category === "done") {
      completed += item.estimate;
    } else if (category === "in_progress" || category === "in_review") {
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
