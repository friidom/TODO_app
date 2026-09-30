import i18n from "@/components/i18n";
import { isGenuineSubtask } from "@/services/todos/subtasks";
import type { GroupKey } from "@/services/todos/view";
import { columnIdOf, type StatusIndex } from "@/services/workflow/statuses";
import type { Todo } from "@/types/data";
import { byRank } from "@/utils/rank";
import { insertionIndex, type Side } from "@/utils/reorder";
import { taskKey } from "@/utils/taskKey";

export const LIST_COLUMN_GROUP = "list-columns";
export const LIST_ROW_GROUP = "list-rows";

export function rowLabel(todo: Todo, keyPrefix: string): string {
  return (
    taskKey(keyPrefix, todo.board_key) ??
    todo.title ??
    i18n.t("task.fallbackName")
  );
}

// A List row move writes the rank the Board writes, and a rank only orders the
// cards of one board column, so a row is dropped among its own column's rows.
// Grouped by status it is kept inside its status's section too: landing in
// another section would read as a status change, and this move makes none.
// null: no column (the backlog, or a status this board does not know).
export function rowReorderContainer(
  todo: Todo,
  group: GroupKey,
  statusById: StatusIndex,
): string | null {
  const columnId = columnIdOf(todo, statusById);

  if (columnId === null) return null;

  return group === "status" ? todo.status_id : columnId;
}

// The index useTodoDrop takes counts every card of the column in rank order,
// not the rows on screen: a filter or a search hides some of them, and the new
// rank still has to land between the two rows the line was drawn between.
export function rowDropIndex(
  todos: Todo[],
  activeTodo: Todo,
  overId: string,
  side: Side,
  statusById: StatusIndex,
): number {
  const columnId = columnIdOf(activeTodo, statusById);

  const column = todos
    .filter(
      (todo) =>
        columnIdOf(todo, statusById) === columnId &&
        !isGenuineSubtask(todos, todo),
    )
    .sort(byRank)
    .map((todo) => todo.id);

  return insertionIndex(column, activeTodo.id, overId, side);
}
