import { taskKey } from "@/utils/taskKey";
import type { Todo, TodoCardContent } from "@/types/data";

// Narrows a full row to what the card renders, camelCased — the card shouldn't know column names.
export function toCardContent(
  todo: Todo,
  keyPrefix: string,
): TodoCardContent {
  return {
    title: todo.title,
    taskKey: taskKey(keyPrefix, todo.board_key),
    workType: todo.type,
    priority: todo.priority,
    dueDate: todo.due_date,
    estimate: todo.estimate,
  };
}
