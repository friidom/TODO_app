import type { ISupabaseTodo } from "../../types/data";
// Extension is explicit: insertDense.check.ts runs this under
// `node --experimental-strip-types`, whose ESM resolver does not guess it.
import { byPosition } from "../../utils/position.ts";

/**
 * Splice `todo` into a column at `index` (appending when omitted) and renumber
 * it. Positions have to come out dense — a gap or a duplicate breaks the
 * column sort. See `insertDense.check.ts` for the checks.
 */
export function insertDense(
  columnTodos: ISupabaseTodo[],
  todo: ISupabaseTodo,
  index?: number,
) {
  const next = [...columnTodos].sort(byPosition);

  next.splice(index ?? next.length, 0, todo);

  return next.map((item, position) => ({ ...item, position }));
}
