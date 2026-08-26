import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import type { Todo, TodoRow } from "../../types/data";
import { rankForAppend } from "../../utils/rank";
import { supabase } from "../api/supabase";

//!SUPABASE//

/**
 * The columns the board and the list actually read (M5-07).
 *
 * **Replaces `select("*")`.** Every card on every board load used to carry
 * `description` — a free-text column rendered by nothing on either view —
 * plus four more with no reader at all: `archived`, `creator_id`, `status`
 * and `previous_status`. On a 200-card board that is bytes fetched, parsed
 * and held in the cache to be ignored. `estimate` rejoined the list at M24,
 * once it had a reader.
 *
 * **Still a string literal, and it has to be** — `supabase-js` infers the shape
 * of the returned row from this exact literal type, so a value of type `string`
 * (a `.join()`, a variable) collapses the result to `GenericStringError[]` and
 * every caller loses its typing. That is why M16 could not simply derive it.
 *
 * What M16 did instead: `TODO_FIELDS` in `types/data.ts` is the field list the
 * `Todo` type is a `Pick` over, and **`todoApi.test.ts` asserts this string is
 * that list joined**. The two are still written twice; they can no longer drift
 * twice, because disagreeing is a failing test rather than a comment nobody
 * re-reads. Widening the row for a new view is one edit there and one here.
 *
 * Used by the write paths as well, so the row a mutation returns has the same
 * shape as the rows already in the cache. A wide row landing in a narrow array
 * would type-check (the extra fields are invisible through `Todo`) and quietly
 * make the cache heterogeneous.
 */
export const TODO_LIST_FIELDS =
  "id, board_id, column_id, position, rank, board_key, title, type, priority, start_date, due_date, assignee_id, estimate, parent_id, created_at, updated_at";

//!get
/**
 * Every todo on one board — **cards and subtasks alike** (M27).
 *
 * Scoped by `board_id`, not `user_id`. RLS is the boundary and this filter is
 * defense in depth, but the two are not interchangeable: once M3 shares a
 * board, a `user_id` filter would hide every card a teammate created — from
 * someone allowed to see them.
 *
 * **No `parent_id` predicate, deliberately.** M27 could have filtered
 * subtasks out here and kept the board's cache meaning exactly "cards", which
 * was the plan's first instinct. Two things argued the other way and both are
 * load-bearing:
 *
 *   · The parent panel's list of children, and the `0/3` count on a card,
 *     would each need their own query and their own invalidation. Reading
 *     them out of the array the board already holds means a subtask created,
 *     renamed, moved or deleted updates every one of those surfaces through
 *     the cache writes that already exist.
 *   · Realtime would need a guard. `applyTodoEvent` inserts any INSERT it has
 *     not seen; with subtasks excluded from the fetch, a subtask arriving
 *     over the socket — including the echo of *this* client's own create —
 *     would be inserted into a cache that had filtered it out, and land on
 *     the board as a card. Keeping the fetch wide makes that event correct
 *     rather than something to defend against.
 *
 * The gate is therefore one client-side predicate in `useVisibleTodos`, which
 * every view already funnels through. What that costs is care in the three
 * places that reason about a *column's* contents — the rank probe below,
 * `useAddTodo`'s optimistic index and `useTodoDrop`'s neighbours — each of
 * which now says `parent_id === null` out loud.
 */
export async function fetchTodos(boardId: string) {
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_LIST_FIELDS)
    .eq("board_id", boardId)
    // By rank as of M6-03. The client re-sorts with `byRank` anyway, so this is
    // a hint rather than the authority — but a query that hands back rows in
    // one order while the app renders another is a trap for the next reader.
    .order("rank", { ascending: true, nullsFirst: false });

  if (error) throw error;

  return data;
}

/**
 * One work item's complete row, for the detail panel (M5-06).
 *
 * `select("*")` here is correct where it was wrong on the board: this fetches
 * one row, on demand, for the only screen that renders `description`.
 *
 * **Scoped by `board_id` as well as `id`, and that is the 404.** A todo the
 * caller can genuinely reach but which belongs to a different board must not
 * open in this board's panel — the deep link `?task=<id>` is user input, and
 * without the board filter a pasted id from another board would render inside
 * the wrong context. `maybeSingle` returns null rather than raising, so a
 * missing row and a foreign row are the same clean not-found, and neither
 * confirms whether the id exists.
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
  start_date = null,
  due_date = null,
  type = DEFAULT_WORK_TYPE,
  parent_id = null,
}: {
  id: string;
  title: string;
  column_id: string;
  board_id: string;
  /** Chosen in the create form before the card existed. Null when untouched. */
  assignee_id?: string | null;
  /**
   * The other end of the range, when the surface that created this card was
   * the timeline (M20-B).
   *
   * Null from every other create surface, which is what it has always been —
   * the column's create card and the header form ask for a due date and
   * nothing else, so a card made there is still a point until someone gives it
   * a range. A range drawn on the axis is the one gesture that supplies both
   * ends at once, and it sends them together so the row is never briefly
   * inverted against `todos_date_range_check`.
   */
  start_date?: string | null;
  due_date?: string | null;
  /** Omitted falls through to the column's own 'Task' default. */
  type?: string;
  /**
   * This row's parent (M27; widened to Epics in M28-A). Null — the default,
   * and what every create surface but the subtask panel and `EpicTasksSection`
   * send — is a normal top-level card. A non-null value makes this either a
   * Subtask (parent is a Task) or a Task under an Epic (parent is an Epic),
   * decided entirely by the parent's own type — never by which create surface
   * sent it.
   *
   * The database is what enforces the shape: `todos_parent_id_fkey` refuses a
   * parent on another board, and `enforce_work_item_hierarchy` refuses an
   * invalid pairing (an Epic with a parent, a Subtask under a Subtask, and so
   * on). Nothing here re-checks either, because a client check that disagreed
   * with the trigger would be the more dangerous of the two.
   */
  parent_id?: string | null;
}) {
  //get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  //get count of todos
  //
  // No `parent_id` predicate, deliberately (M27 added one; M28-A removes it).
  // This is an APPEND — `rankForAppend` always places the new row after
  // whatever the highest rank in the column already is — and appending after
  // the highest rank in the column, whatever row it belongs to, still places
  // the new card after every *visible* card, because every visible card's own
  // rank is itself ≤ that same maximum. A Subtask's or a Task-under-Epic's
  // rank is just a number in the same space; it is never rendered, so it
  // never causes a misplacement, only ever a correct append. Filtering it out
  // would only be needed for an index-based *insert-between*, which this is
  // not — see `useAddTodo`'s optimistic filter for where that distinction
  // actually matters and is actually applied.
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
  // ordering above is by rank now (M6-03), so "last" means last on screen.
  const rank = rankForAppend(lastTodo ? [lastTodo] : []);

  //insert it in database
  const { data, error } = await supabase
    .from("todos")
    .upsert(
      {
        id,
        title,
        column_id,
        board_id,
        // Authorship moved here when M2-13 dropped user_id. Unlike user_id,
        // creator_id has no auth.uid() default — left unset, every card created
        // from now on would have no recorded author at all.
        creator_id: user.id,
        position,
        rank,
        assignee_id,
        start_date,
        due_date,
        type,
        parent_id,
      },
      { onConflict: "id" },
    )
    .select(TODO_LIST_FIELDS)
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
 * A move: **one row, two columns of it** (M6-04).
 *
 * Replaces the whole-column renumbering `reorderTodos` does. A drag used to
 * write every card in the source column and every card in the destination —
 * with two editors, each client renumbered from its own snapshot and the array
 * was last-write-wins, so B's drag silently overwrote A's, including cards B
 * never touched. Writing only the card that moved makes that a conflict only
 * when two people move the same card.
 *
 * `position` is deliberately **not** written here, and that is the one place
 * M6-04 diverges from the plan's rollback note. A single-row dense position
 * does not exist: the value between 1 and 2 is not an integer. Positions
 * therefore stop being maintained by the drag path and are re-derived from
 * ranks if the deploy is ever rolled back — one statement, recorded in
 * `20260814121000_backfill_ranks.sql`. The insert path still renumbers them,
 * so they stay a lazily-updated mirror of rank order rather than going stale
 * immediately.
 */
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
 * Respace one column's ranks so a midpoint exists again (M6-06).
 *
 * Called only when `rankBetween` reports exhaustion — roughly fifty consecutive
 * drops into the same gap. The server derives every new value from the order
 * the rows are already in; nothing about the new order is sent from here, which
 * is the property M3-10 asked for and the reason it closes.
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
 * **No longer the drag path** — M6-04 replaced that with `moveTodo`, one row per
 * move. What is left is the insert path: creating a card at a chosen gap shifts
 * every card below it, and `position` is still maintained (it is the rollback
 * for M6-A until M6-05 drops it). Because the array handed here is already in
 * rank order, the positions it writes stay a faithful mirror of that order.
 *
 * `board_id` is in the payload deliberately, and this is not optional.
 * PostgREST turns an upsert into INSERT ... ON CONFLICT DO UPDATE, and the
 * INSERT policy's WITH CHECK is evaluated against the *proposed* row. Omit
 * board_id and that row carries NULL, which fails M2-08's policy and M2-07's
 * NOT NULL — surfacing as a write that silently reverts on refresh.
 *
 * Stamped from the board being viewed rather than read off each row, so the
 * value cannot be null even if a row in the cache is stale.
 */
export async function reorderTodos(todos: Todo[], boardId: string) {
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
 * Deliberately a narrow allow-list rather than `Partial<Todo>`:
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
 * migration. `description` joined it for the same reason at M5-06.
 *
 * `estimate` joined at M24, backed by `todos_estimate_check`
 * (`is null or >= 0`). No control writes it yet — this is the allow-list
 * half of the milestone, ahead of the UI half by design.
 *
 * Picked from `TodoRow`, not `Todo`: `description` is not one of the columns
 * the board fetches (M5-07), so the narrowed type cannot name it. What may be
 * *written* and what the board *reads* are different questions — `estimate`
 * happens to answer both the same way after M24 widened `TODO_FIELDS`, but
 * the two lists still serve different purposes and are kept separate here.
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
    | "estimate"
    // M27. **No control writes this yet** — re-parenting has no UI in this
    // milestone, by its own scope. It is admitted because the column, its
    // constraints and its `parent_changed` activity branch all exist, and a
    // field the database can change while the allow-list refuses it is the
    // shape that makes the next person add a second write path. `null`
    // promotes a subtask back to a top-level card.
    | "parent_id"
  >
>;

/**
 * Patch one card.
 *
 * **Takes a patch, not a whole row.** It used to accept an `Todo` and
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
    .select(TODO_LIST_FIELDS)
    .single();

  if (error) throw error;

  return data;
}
