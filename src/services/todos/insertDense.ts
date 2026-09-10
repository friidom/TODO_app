import type { Todo } from "../../types/data";
import { byRank } from "../../utils/rank";

// positions must come out dense — a gap or duplicate breaks the column sort
export function insertDense(columnTodos: Todo[], todo: Todo, index?: number) {
  const next = [...columnTodos].sort(byRank);

  next.splice(index ?? next.length, 0, todo);

  return next.map((item, position) => ({ ...item, position }));
}
