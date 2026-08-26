import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import type { Todo, TodoRow } from "../../types/data";
import { rankForAppend } from "../../utils/rank";
import { supabase } from "../api/supabase";

/**
 * The columns the board and the list actually read, in place of `select("*")`.
 *
 * Has to stay a string literal: supabase-js infers the returned row from this
 * exact literal type, so anything of type `string` (a `.join()`, a variable)
 * collapses the result to `GenericStringError[]` and every caller loses its
 * typing.
 *
 * TODO_FIELDS in types/data.ts is the same list as an array, and
 * todoApi.test.ts asserts this string is that list joined. Still written twice,
 * but they can't drift — disagreeing is a failing test.
 *
 * The write paths use it too, so a row a mutation returns has the same shape as
 * the rows already in the cache. A wide row landing in a narrow array would
 * type-check and quietly make the cache heterogeneous.
 */
export const TODO_LIST_FIELDS =
  "id, board_id, column_id, position, rank, board_key, title, type, priority, start_date, due_date, assignee_id, created_at, updated_at";

/**
 * Every todo on one board.
 *
 * Scoped by board_id, not user_id. RLS is the boundary and this is defense in
 * depth, but the two aren't interchangeable: on a shared board a user_id filter
 * would hide every card a teammate created, from someone allowed to see them.
 */
export async function fetchTodos(boardId: string) {
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_LIST_FIELDS)
    .eq("board_id", boardId)
    // The client re-sorts with byRank anyway, so this is a hint rather than the
    // authority. But a query handing back rows in one order while the app
    // renders another is a trap for the next reader.
    .order("rank", { ascending: true, nullsFirst: false });

  if (error) throw error;

  return data;
}

/**
 * One work item's complete row, for the detail panel.
 *
 * `select("*")` is right here where it was wrong on the board: one row, on
 * demand, for the only screen that renders `description`.
 *
 * Scoped by board_id as well as id, and that's the 404. The deep link
 * `?task=<id>` is user input, so without the board filter a pasted id from
 * another board would render inside the wrong context. `maybeSingle` returns
 * null rather than raising, so a missing row and a foreign row are the same
 * clean not-found and neither confirms whether the id exists.
 */
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
}: {
  id: string;
  title: string;
  column_id: string;
  board_id: string;
  /** Chosen in the create form before the card existed. Null when untouched. */
  assignee_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  /** Omitted falls through to the column's own 'Task' default. */
  type?: string;
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

  // Appended, so the bottom gap: one constant step below the last card. The
  // ordering above is by rank, so "last" means last on screen.
  const rank = rankForAppend(lastTodo ? [lastTodo] : []);

  const { data, error } = await supabase
    .from("todos")
    .upsert(
      {
        id,
        title,
        column_id,
        board_id,
        // Unlike the user_id it replaced, creator_id has no auth.uid() default.
        // Left unset, every card created from now on has no recorded author.
        creator_id: user.id,
        position,
        rank,
        assignee_id,
        start_date,
        due_date,
        type,
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
    // Defense in depth beside RLS, and the same scoping every other write uses.
    .eq("board_id", boardId);

  if (error) throw error;
}

/**
 * Respace one column's ranks so a midpoint exists again.
 *
 * Called only when rankBetween reports exhaustion, roughly fifty consecutive
 * drops into the same gap. The server derives every new value from the order
 * the rows are already in; no ordering is sent from here.
 */
export async function rebalanceColumnRanks(columnId: string) {
  const { error } = await supabase.rpc("rebalance_column_ranks", {
    p_column_id: columnId,
  });

  if (error) throw error;
}

/**
 * Renumber a column's dense `position` values.
 *
 * No longer the drag path — moveTodo replaced that with one row per move. What
 * is left is the insert path: creating a card at a chosen gap shifts every card
 * below it. The array handed here is already in rank order, so the positions it
 * writes stay a faithful mirror of that order.
 *
 * board_id is in the payload deliberately, and it isn't optional. PostgREST
 * turns an upsert into INSERT ... ON CONFLICT DO UPDATE, and the INSERT
 * policy's WITH CHECK is evaluated against the *proposed* row. Omit board_id
 * and that row carries NULL, which fails both the policy and the NOT NULL —
 * surfacing as a write that silently reverts on refresh.
 *
 * Stamped from the board being viewed rather than read off each row, so it
 * can't be null even if a cached row is stale.
 */
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

/**
 * The fields a card's own controls may write.
 *
 * A narrow allow-list rather than `Partial<Todo>`: creator_id and board_key are
 * the server's, and position belongs to the drag path.
 *
 * board_id is required rather than patchable — it identifies the row's board
 * for the upsert below, and it's what the INSERT policy is evaluated against,
 * so omitting it would propose a row with a NULL board and be refused.
 *
 * Picked from TodoRow, not Todo: `description` isn't one of the twelve columns
 * the board fetches, so the narrowed type can't name it. What may be *written*
 * and what the board *reads* are different questions.
 */
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
  >
>;

/**
 * Patch one card.
 *
 * Takes a patch, not a whole row. It used to accept a Todo and write title and
 * column_id off it, so every caller spread a cached row it didn't intend to
 * change and a title edit wrote back whatever else that row was holding. A key
 * set to `undefined` is dropped during serialisation and left alone; clearing a
 * field is an explicit `null`, which is how Clear and Unassign work.
 *
 * Upsert rather than update, and that's why board_id is required. A freshly
 * created card is on screen with its real id and working controls before its
 * INSERT has landed, because addTodo makes two round trips first. An
 * `.update().single()` in that window matches zero rows and fails with
 * PGRST116, so setting a due date on a just-created card silently did nothing
 * until reload. The upsert has no such window: whichever write arrives first
 * creates the row and the other fills its columns in.
 *
 * ON CONFLICT DO UPDATE only assigns the columns present in the payload, so
 * patching a due date can't disturb the title, column or position.
 */
export async function updateTodo({ id, board_id, ...patch }: TodoPatch) {
  const { data, error } = await supabase
    .from("todos")
    .upsert({ id, board_id, ...patch }, { onConflict: "id" })
    .select(TODO_LIST_FIELDS)
    .single();

  if (error) throw error;

  return data;
}
