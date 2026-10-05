import { ApiError, api } from "@/services/api/client";
import { fetchTodo } from "@/services/todos/todoApi";
import { isUuid } from "@/utils/uuid";

export type TaskLocation = { board_id: string; todo_id: string };

export async function resolveTaskRef(
  ref: string,
): Promise<TaskLocation | null> {
  if (isUuid(ref)) {
    const todo = await fetchTodo(ref);

    return todo && { board_id: todo.board_id, todo_id: todo.id };
  }

  try {
    return await api.get<TaskLocation>(`/task-refs/${encodeURIComponent(ref)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;

    throw error;
  }
}
