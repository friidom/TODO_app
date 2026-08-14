import { taskKey } from "@/utils/taskKey";
import type { Todo, TodoCardContent } from "@/types/data";

/**
 * A stored row, narrowed to the values the card puts on screen.
 *
 * **The one place a `todos` row becomes card content.** Before M5-01 every
 * call site spread a whole database row into `<TodoItem {...todo} />`, so the
 * card's props were the schema — `description`, `estimate`, `archived`,
 * `previous_status` and the rest travelled into a leaf component that reads
 * none of them, and adding a column changed the card's type.
 *
 * Pure, and the seam the rest of M5 leans on: M5-07 narrows the board query to
 * roughly this field list, and it can check the two against each other here
 * rather than by reading the card's JSX.
 *
 * The rename to camelCase is not decoration. `board_key` is a column name; a
 * component that speaks it is a component coupled to the table. This is the
 * boundary where that stops.
 *
 * It returns *content only*. Identity (`id`, `board_id`, `column_id`) is not
 * here because M5-02 left it with `TodoItem`, which is what drags the card and
 * writes its changes — the presentational card needs none of the three.
 */
export function toCardContent(
  todo: Todo,
  /**
   * The board's `key_prefix` (M14). A second argument rather than a field on
   * the row, because it is not on the row: the prefix belongs to the board and
   * the counter belongs to the work item, and this is where the two meet.
   */
  keyPrefix: string,
): TodoCardContent {
  return {
    title: todo.title,
    taskKey: taskKey(keyPrefix, todo.board_key),
    workType: todo.type,
    priority: todo.priority,
    dueDate: todo.due_date,
  };
}
