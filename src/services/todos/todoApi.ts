import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import type { ISupabaseTodo } from "../../types/data";
// import axios from "axios";
import { supabase } from "../api/supabase";

//!SUPABASE//

//!get
/**
 * Every todo on one board.
 *
 * Scoped by `board_id`, not `user_id`. RLS is the boundary and this filter is
 * defense in depth, but the two are not interchangeable: once M3 shares a
 * board, a `user_id` filter would hide every card a teammate created — from
 * someone allowed to see them.
 */
export async function fetchTodos(boardId: string) {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  if (error) throw error;

  return data;
}

//!post
/**
 * `id` is minted by the caller (M2-14) rather than by the database, which is
 * what lets the optimistic row and the stored row be the same row.
 *
 * An upsert rather than an insert, for the same reason: the client owns the
 * key, so the write is idempotent. It also settles a race the `isOptimistic`
 * flag used to guard — `useAddTodo`'s follow-up `reorderTodos` is itself an
 * upsert, and if it reaches a still-pending card first it creates that row
 * with a position and no title. An insert would then fail on the duplicate
 * key; the upsert fills the title in.
 */
export async function addTodo({
  id,
  title,
  column_id,
  board_id,
  assignee_id = null,
  due_date = null,
  type = DEFAULT_WORK_TYPE,
}: {
  id: string;
  title: string;
  column_id: string;
  board_id: string;
  /** Chosen in the create form before the card existed. Null when untouched. */
  assignee_id?: string | null;
  due_date?: string | null;
  /** Omitted falls through to the column's own 'Task' default. */
  type?: string;
}) {
  //get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  //get count of todos
  const { data: lastTodo, error: lastTodoError } = await supabase
    .from("todos")
    .select("position")
    .eq("column_id", column_id)
    .eq("board_id", board_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastTodoError) throw lastTodoError;

  const position = (lastTodo?.position ?? -1) + 1;

  //insert it in database
  const { data, error } = await supabase
    .from("todos")
    .upsert({
      id,
      title,
      column_id,
      board_id,
      // Authorship moved here when M2-13 dropped user_id. Unlike user_id,
      // creator_id has no auth.uid() default — left unset, every card created
      // from now on would have no recorded author at all.
      creator_id: user.id,
      position,
      assignee_id,
      due_date,
      type,
    }, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;

  return data;
}


//!delete
export async function deleteTodo(id: string) {
  const { error } = await supabase.from("todos").delete().eq("id", id);
  
  if (error) throw error;
  
  return id;
}

//!reorder
/**
 * `board_id` is in the payload deliberately, and this is not optional.
 *
 * PostgREST turns an upsert into INSERT ... ON CONFLICT DO UPDATE, and the
 * INSERT policy's WITH CHECK is evaluated against the *proposed* row. Omit
 * board_id and that row carries NULL, which fails M2-08's policy and M2-07's
 * NOT NULL — surfacing as a drag that silently reverts on refresh.
 *
 * Stamped from the board being viewed rather than read off each row, so the
 * value cannot be null even if a row in the cache is stale.
 */
export async function reorderTodos(todos: ISupabaseTodo[], boardId: string) {
  //update newest info
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

//!patch
//!edit todos

/**
 * The fields a card's own controls may write.
 *
 * Deliberately a narrow allow-list rather than `Partial<ISupabaseTodo>`:
 * `creator_id` and `board_key` are the server's, and `position` belongs to the
 * drag path. `column_id` stays because `updateTodo` was already writing it.
 *
 * `board_id` is required rather than patchable — it identifies the row's board
 * for the upsert below, and every value sent is the one the card already holds.
 * It is also what M2-08's INSERT policy is evaluated against, so omitting it
 * would propose a row with a NULL board and be refused.
 *
 * `priority` joined the list when the priority control was built. The column and
 * its CHECK constraint have existed since M2-04 — this allow-list was the only
 * thing standing between them and the UI, which is why that feature needed no
 * migration.
 */
export type TodoPatch = { id: string; board_id: string } & Partial<
  Pick<
    ISupabaseTodo,
    "title" | "column_id" | "due_date" | "assignee_id" | "type" | "priority"
  >
>;

/**
 * Patch one card.
 *
 * **Takes a patch, not a whole row.** It used to accept an `ISupabaseTodo` and
 * write `title` and `column_id` off it, so every caller had to spread a cached
 * row it did not intend to change — and a title edit would write back whatever
 * else that row happened to be holding. Sending only the changed keys removes
 * that. A key set to `undefined` is dropped during serialisation and is left
 * alone; clearing a field is an explicit `null`, which is how the due date's
 * Clear button and the assignee's Unassign work.
 *
 * **An upsert rather than an update, and `board_id` is required for that
 * reason.** This is the same argument M2-14 records for `addTodo`, reaching the
 * card's own controls.
 *
 * A freshly created card is on screen with its real id and working controls
 * before its INSERT has landed — `addTodo` makes two round trips (the auth
 * lookup and the position query) before it writes. An `.update().single()` in
 * that window matches zero rows and fails with PGRST116, so setting a due date
 * or an assignee on a card that was just created silently did nothing until the
 * page was reloaded. The upsert has no such window: whichever write arrives
 * first creates the row and the other fills its columns in.
 *
 * `ON CONFLICT DO UPDATE` only assigns the columns present in the payload, so
 * patching a due date on an existing card cannot disturb its title, column or
 * position.
 */
export async function updateTodo({ id, board_id, ...patch }: TodoPatch) {
  const { data, error } = await supabase
    .from("todos")
    .upsert({ id, board_id, ...patch }, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;

  return data;
}
