import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import { ApiError, api } from "../api/client";
import type { Todo, TodoDetail, TodoRow } from "../../types/data";

export function fetchTodos(boardId: string): Promise<Todo[]> {
  return api.get<Todo[]>(`/boards/${boardId}/todos`);
}

// null rather than a throw: ?task=<id> is user input, so a pasted id from
// another board answers 404 and the modal renders "not found" instead of
// leaking that the card exists.
export async function fetchTodo(todoId: string): Promise<TodoDetail | null> {
  try {
    return await api.get<TodoDetail>(`/todos/${todoId}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;

    throw error;
  }
}

export function addTodo({
  id,
  title,
  status_id,
  board_id,
  assignee_id = null,
  start_date = null,
  due_date = null,
  type = DEFAULT_WORK_TYPE,
  parent_id = null,
  sprint_id = null,
}: {
  id: string;
  title: string;
  status_id: string | null;
  board_id: string;
  assignee_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  type?: string;
  parent_id?: string | null;
  sprint_id?: string | null;
}): Promise<Todo> {
  return api.post<Todo>(`/boards/${board_id}/todos`, {
    id,
    title,
    status_id,
    assignee_id,
    start_date,
    due_date,
    type,
    parent_id,
    sprint_id,
  });
}

export function addBacklogItem({
  id,
  title,
  board_id,
  backlog_rank,
  type = DEFAULT_WORK_TYPE,
  sprint_id = null,
  status_id = null,
  rank = null,
}: {
  id: string;
  title: string;
  board_id: string;
  backlog_rank: number;
  type?: string;
  sprint_id?: string | null;
  status_id?: string | null;
  rank?: number | null;
}): Promise<Todo> {
  return api.post<Todo>(`/boards/${board_id}/todos`, {
    id,
    title,
    status_id,
    rank,
    backlog_rank,
    type,
    sprint_id,
  });
}

export async function deleteTodo(id: string): Promise<string> {
  await api.del<void>(`/todos/${id}`);

  return id;
}

export async function moveTodo({
  id,
  statusId,
  rank,
}: {
  id: string;
  boardId: string;
  statusId: string;
  rank: number;
}): Promise<void> {
  await api.post<void>(`/todos/${id}/move`, { status_id: statusId, rank });
}

export async function rebalanceColumnRanks(
  boardId: string,
  columnId: string,
): Promise<void> {
  await api.post<{ rebalanced: number }>(
    `/boards/${boardId}/columns/${columnId}/rebalance`,
  );
}

export type TodoPatch = { id: string; board_id: string } & Partial<
  Pick<
    TodoRow,
    | "title"
    | "status_id"
    | "start_date"
    | "due_date"
    | "assignee_id"
    | "type"
    | "priority"
    | "description"
    | "estimate"
    | "parent_id"
    | "sprint_id"
    | "rank"
    | "backlog_rank"
  >
>;

// PATCH is an upsert server-side: a freshly created card can be patched before
// its insert lands, and an update would silently match zero rows. The board
// would look correct and then revert.
export function updateTodo({ id, board_id, ...patch }: TodoPatch): Promise<Todo> {
  return api.patch<Todo>(`/boards/${board_id}/todos/${id}`, patch);
}
