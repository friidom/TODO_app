import type { Todo } from "../../types/data";
import { byPosition } from "../../utils/position";

/**
 * Splice `todo` into a column at `index` (appending when omitted) and renumber
 * it. Positions have to come out dense — a gap or a duplicate breaks the
 * column sort. See `insertDense.check.ts` for the checks.
 */
export function insertDense(
  columnTodos: Todo[],
  todo: Todo,
  index?: number,
) {
  const next = [...columnTodos].sort(byPosition);

  next.splice(index ?? next.length, 0, todo);

  return next.map((item, position) => ({ ...item, position }));
}
