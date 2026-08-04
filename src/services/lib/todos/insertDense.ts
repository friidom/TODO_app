import type { ISupabaseTodo } from "../../../types/data";

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
  const next = [...columnTodos].sort((a, b) => a.position - b.position);

  next.splice(index ?? next.length, 0, todo);

  return next.map((item, position) => ({ ...item, position }));
}
