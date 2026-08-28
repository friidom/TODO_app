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
 * Narrower than `select("*")`: `description` and four columns with no reader
 * were fetched, parsed and cached on every board load to be ignored.
 * `estimate` rejoined at M24, once it had one.
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
  "id, board_id, column_id, position, rank, board_key, title, type, priority, start_date, due_date, assignee_id, estimate, parent_id, sprint_id, backlog_rank, created_at, updated_at";

/**
 * Every todo on one board — **cards and subtasks alike** (M27).
 *
 * Scoped by board_id, not user_id. RLS is the boundary and this is defense in
 * depth, but the two aren't interchangeable: on a shared board a user_id filter
 * would hide every card a teammate created, from someone allowed to see them.
 *
 * **No `parent_id` predicate, deliberately** (M27). Subtasks stay in the one
 * board cache for two reasons: a parent's children and a card's `0/3` count
 * read out of the array the board already holds, so neither needs its own query
 * or invalidation; and `applyTodoEvent` inserts any INSERT it has not seen, so
 * a fetch that excluded subtasks would let one arrive over the socket and land
 * on the board as a card. The gate is one predicate in `useVisibleTodos`
 * instead, which every view funnels through.
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
  parent_id = null,
  sprint_id = null,
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
  /**
   * The sprint this card is created into — the board's *active* one, supplied
   * by `useAddTodo` rather than by any create surface.
   *
   * **Why the create path writes it at all.** This function's callers all
   * create a card straight into a board column, and a card in a board column
   * while a sprint is running *is* that sprint's work. Leaving it null made
   * every card created on the Board absent from the sprint it was plainly
   * part of: missing from its section in the Backlog, missing from its
   * points rollup, and — once `isOnBoard` began reading `sprint_id` — absent
   * from the Board it had just been typed into.
   *
   * Null is still a real and ordinary value: it is what a board with no
   * active sprint writes, and `isOnBoard` treats such a card as ad-hoc work
   * that is on the Board on its `column_id` alone.
   *
   * Legal against `enforce_work_item_hierarchy` for everything this function
   * creates. Only a *genuine* Subtask is barred from carrying a sprint of its
   * own, and a Subtask is never created here — `useAddSubtask` is a separate
   * mutation, and it sends nothing to this function.
   */
  sprint_id?: string | null;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  // No `parent_id` predicate: this is an APPEND, and appending after the
  // column's highest rank lands after every visible card too, since each
  // visible rank is itself <= that maximum. Only an index-based insert-between
  // needs the filter — see `useAddTodo`'s optimistic index.
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

/**
 * A new work item created straight into the Backlog view (M29) — no column,
 * a `backlog_rank` instead of a `rank`, optionally planned into a Sprint from
 * the moment it exists.
 *
 * **A separate function from `addTodo`, for the reason `useAddSubtask` is
 * separate from it.** `addTodo`'s own rank probe is scoped to a `column_id`
 * this row does not have, and appending to the Backlog view (or to one
 * Sprint's section of it) is a question about `backlog_rank`, a column
 * `addTodo` has never touched. Reusing it would mean threading a "sometimes
 * there is no column" branch through a function whose whole shape assumes
 * one.
 *
 * `sprint_id` is accepted directly rather than through a follow-up patch —
 * "create a Task inside this Sprint's section" is one gesture, and writing
 * the row twice would mean a moment where a freshly created card belongs to
 * no section at all.
 */
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
  /** Computed by the caller via `backlogRankForAppend` over whichever
   * section (the Backlog, or one Sprint's) this item is being appended to —
   * the same "caller knows which list it is appending to" shape
   * `createColumn` already uses for the Board's own rank. */
  backlog_rank: number;
  type?: string;
  sprint_id?: string | null;
  /** M31. Set together, only when `sprint_id` is the board's *active*
   * Sprint — `backlog.ts`'s `boardEntryOnActiveSprint` decides both, so a
   * Task or Epic created straight into a running Sprint appears on the
   * Board immediately, in the same column `start_sprint` would have used.
   * Null for every other creation, exactly as before this existed. */
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
 * Picked from TodoRow, not Todo: `description` isn't one of the columns the
 * board fetches, so the narrowed type can't name it. What may be *written* and
 * what the board *reads* are different questions.
 *
 * `estimate` joined the list at M24, backed by `todos_estimate_check`.
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
    // M27, written by `EpicParentControl` since M28-A. `null` promotes a
    // subtask back to a top-level card, or clears a Task's Epic.
    | "parent_id"
    // M30. Independent of `parent_id` — see the migration header. `null`
    // removes a work item from its Sprint without touching its column.
    // Writing this directly is only ever legal for an Epic or a Task; a
    // genuine Subtask's own `sprint_id` is refused by
    // `enforce_work_item_hierarchy`, the same trigger this column's own
    // depth rule already goes through.
    | "sprint_id"
    // M31. Written only alongside `column_id`, by `sprintAssignmentPatch`
    // (`services/todos/backlog.ts`) — a work item entering the Board through
    // Sprint planning needs a rank in its new column the same way a drag
    // does, and `rankForAppend` is the same utility `useTodoDrop`/`useAddTodo`
    // already use for "append to the end" rather than a second computation.
    | "rank"
    // M31, by the same function — moving a work item between Sprint
    // sections keeps its Backlog-page order correct instead of carrying the
    // rank from whichever section it left.
    | "backlog_rank"
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
