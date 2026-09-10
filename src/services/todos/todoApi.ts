import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import type { Todo, TodoRow } from "../../types/data";
import { rankForAppend } from "../../utils/rank";
import { supabase } from "../api/supabase";

// Has to stay a string literal — supabase-js infers the row type from it, so a variable/join collapses everything to GenericStringError[].
// Kept in sync with TODO_FIELDS in types/data.ts; todoApi.test.ts asserts they match.
export const TODO_LIST_FIELDS =
  "id, board_id, column_id, position, rank, board_key, title, type, priority, start_date, due_date, assignee_id, estimate, parent_id, sprint_id, backlog_rank, created_at, updated_at";

export async function fetchTodos(boardId: string) {
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_LIST_FIELDS)
    .eq("board_id", boardId)
    .order("rank", { ascending: true, nullsFirst: false });

  if (error) throw error;

  return data;
}

// board_id + id, not id alone — ?task=<id> is user input, so a pasted id from another board must 404, not leak the row.
export async function fetchTodo(
  todoId: string,
  boardId: string,
): Promise<TodoRow | null> {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("id", todoId)
    .eq("board_id", boardId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function addTodo({
  id,
  title,
  column_id,
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
  column_id: string;
  board_id: string;
  assignee_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  type?: string;
  parent_id?: string | null;
  sprint_id?: string | null;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data: lastTodo, error: lastTodoError } = await supabase
    .from("todos")
    .select("position, rank")
    .eq("column_id", column_id)
    .eq("board_id", board_id)
    .order("rank", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (lastTodoError) throw lastTodoError;

  const position = (lastTodo?.position ?? -1) + 1;
  const rank = rankForAppend(lastTodo ? [lastTodo] : []);

  const { data, error } = await supabase
    .from("todos")
    .upsert(
      {
        id,
        title,
        column_id,
        board_id,
        creator_id: user.id,
        position,
        rank,
        assignee_id,
        start_date,
        due_date,
        type,
        parent_id,
        sprint_id,
      },
      { onConflict: "id" },
    )
    .select(TODO_LIST_FIELDS)
    .single();

  if (error) throw error;

  return data;
}

export async function addBacklogItem({
  id,
  title,
  board_id,
  backlog_rank,
  type = DEFAULT_WORK_TYPE,
  sprint_id = null,
  column_id = null,
  rank = null,
}: {
  id: string;
  title: string;
  board_id: string;
  backlog_rank: number;
  type?: string;
  sprint_id?: string | null;
  column_id?: string | null;
  rank?: number | null;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("todos")
    .upsert(
      {
        id,
        title,
        board_id,
        creator_id: user.id,
        column_id,
        position: null,
        rank,
        backlog_rank,
        type,
        sprint_id,
      },
      { onConflict: "id" },
    )
    .select(TODO_LIST_FIELDS)
    .single();

  if (error) throw error;

  return data;
}

export async function deleteTodo(id: string) {
  const { error } = await supabase.from("todos").delete().eq("id", id);

  if (error) throw error;

  return id;
}

export async function moveTodo({
  id,
  boardId,
  columnId,
  rank,
}: {
  id: string;
  boardId: string;
  columnId: string;
  rank: number;
}) {
  const { error } = await supabase
    .from("todos")
    .update({ column_id: columnId, rank })
    .eq("id", id)
    .eq("board_id", boardId);

  if (error) throw error;
}

export async function rebalanceColumnRanks(columnId: string) {
  const { error } = await supabase.rpc("rebalance_column_ranks", {
    p_column_id: columnId,
  });

  if (error) throw error;
}

// board_id must be in the payload — PostgREST's upsert runs the INSERT policy's WITH CHECK against the proposed row, and a missing board_id fails it silently.
export async function reorderTodos(todos: Todo[], boardId: string) {
  const updates = todos.map((todo) => ({
    id: todo.id,
    position: todo.position,
    column_id: todo.column_id,
    board_id: boardId,
  }));

  const { error } = await supabase.from("todos").upsert(updates, {
    onConflict: "id",
  });

  if (error) throw error;
}

export type TodoPatch = { id: string; board_id: string } & Partial<
  Pick<
    TodoRow,
    | "title"
    | "column_id"
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

// Upsert, not update — a freshly created card can get patched before its insert lands, and .update() would silently match zero rows.
export async function updateTodo({ id, board_id, ...patch }: TodoPatch) {
  const { data, error } = await supabase
    .from("todos")
    .upsert({ id, board_id, ...patch }, { onConflict: "id" })
    .select(TODO_LIST_FIELDS)
    .single();

  if (error) throw error;

  return data;
}
