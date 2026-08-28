import type { Database } from "./database";

/** Shorthand for a generated table row — `Row<"todos">` etc. */
type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

// Everything below is derived from database.ts, which `npm run db:types`
// generates. Don't hand-edit fields: if one looks wrong the schema is wrong,
// and the fix is a migration plus regeneration.
//
// Nullability is the database's, not ours. title, position, column_id and
// category are all nullable columns, which is why categoryOf() takes
// `string | null` and the sorts guard their inputs.

/**
 * A complete `todos` row.
 *
 * Rarely what you want — the board and the list hold `Todo` below. This is for
 * the detail view, the only screen that renders `description`.
 */
export type TodoRow = Row<"todos">;

/**
 * A work item as the board holds it: the twelve columns the UI actually uses.
 *
 * The board query doesn't `select("*")`, so this isn't a convenience narrowing,
 * it's what the cache genuinely contains. Typing it as the full row would let
 * `todo.description` type-check and be undefined at runtime.
 *
 * Absent on purpose: description, archived, creator_id, status,
 * previous_status. The last two are dead columns (doneness is the column's
 * category), and nothing reads archived or creator_id. `estimate` was among
 * them until M24 gave it a meaning — story points — and a reader.
 *
 * `Todo` is a Pick over TODO_FIELDS, so the list and the type can't disagree,
 * and `satisfies` turns a typo into a compile error instead of a column
 * PostgREST rejects at runtime.
 *
 * This is the row shape every view reads (M16), so widening it happens here
 * once rather than per view.
 *
 * Can't be merged with TODO_LIST_FIELDS in todos/todoApi.ts, tempting as that
 * is: supabase-js infers the row from the select's *literal* type, and a
 * derived string collapses every result to `GenericStringError[]`. They stay
 * two constants and todoApi.test.ts asserts they agree.
 */
export const TODO_FIELDS = [
  "id",
  "board_id",
  "column_id",
  "position",
  // Both orderings for now. `rank` is what the app orders by; `position` is
  // still written by the insert path and is the rollback, which is why
  // dropping it is a later migration after a soak.
  "rank",
  "board_key",
  "title",
  "type",
  "priority",
  // Both ends of the range. Same convention as due_date: a timestamptz holding
  // midnight UTC, read back through toCalendarDay. See
  // 20260817090000_todos_start_date.sql for why these aren't `date`.
  "start_date",
  "due_date",
  "assignee_id",
  // Story points (M24). `null` means unestimated, not zero — see
  // `20260826090000_todos_estimate_check.sql` for the constraint that keeps
  // the column from meaning "points or hours" depending on who filled it in.
  "estimate",
  // The hierarchy, and the one field here the board deliberately does not
  // render (M27). `null` is a normal top-level card; anything else is a
  // subtask, which must not be drawn as a card. It is fetched anyway because
  // this cache is the only source both questions are answered from:
  // `useVisibleTodos` filters subtasks out for every view, and the parent
  // panel reads the very same array to list its children and count how many
  // are done. A second query would be a second thing to keep invalidated.
  "parent_id",
  // Which Sprint this item is planned into, or null (M30). Independent of
  // `parent_id` and of `column_id` by design — see the migration header on
  // why the Backlog view needs this on the same cached array the Board and
  // List already read, rather than a second query.
  "sprint_id",
  // This item's order in the Backlog view (M29) — a second rank, because a
  // card's spot in the planning list and its spot in a Kanban column are
  // different questions. `null` until it has ever been placed in one.
  "backlog_rank",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof TodoRow)[];

export type Todo = Pick<TodoRow, (typeof TODO_FIELDS)[number]>;

/**
 * A time-boxed container with its own lifecycle (M30).
 *
 * The whole row, unlike `Todo`: every surface that reads a sprint — the
 * Backlog section header, Sprint Details, the Complete Sprint dialog — wants
 * all of it, and no board query fetches a narrower slice.
 *
 * Not a `todos` row wearing `type = 'Sprint'` — see the migration header for
 * why a sprint is a table of its own.
 */
export type Sprint = Row<"sprints">;

/**
 * One entry in a board's history.
 *
 * Trigger-written and read-only here: there's no insert grant on the table, so
 * nothing in the app can construct one and send it.
 *
 * entity_type and action are plain text with a CHECK over the *pair*, so both
 * generate as `string`. The union that matters is applied where it's read, in
 * activities/activityText.ts.
 */
export type Activity = Row<"activities">;

/**
 * One comment on one work item.
 *
 * The whole row, unlike `Todo` — the table has seven columns and the thread
 * uses all of them.
 *
 * board_id is here because the policy needs it, not a reader. It's
 * denormalised from the work item and pinned by a composite foreign key, so it
 * can't say anything todo_id doesn't already imply.
 *
 * "Has this been edited?" is `updated_at > created_at`, stamped by a trigger.
 */
export type Comment = Row<"comments">;

export type ISupabaseProfile = Row<"profiles">;

export type IColumn = Row<"columns">;

export type IBoard = Row<"boards">;

/**
 * A folder for boards. Owner-only by RLS and **not a permission scope** —
 * filing a board into a space grants nobody access to it. A board you're a
 * member of but whose space belongs to someone else reads as unfiled, because
 * that space row isn't returned to you at all.
 */
export type ISpace = Row<"spaces">;

/**
 * Client-only state about a todo that no column of `todos` holds.
 *
 * Separate from `Todo` rather than optional fields on it. The old
 * `isOptimistic?` lived inside the row type, so a database row and a UI concern
 * shared one shape and neither could be reasoned about alone.
 */
export interface TodoViewState {
  /** This card is the one under the cursor — the board dims it in place. */
  dragging?: boolean;
  /** This is the DragOverlay's copy, not the card in the column. */
  overlay?: boolean;
  /**
   * Whether this card may be picked up. A drop means "put it here", and "here"
   * is only answerable while the board shows stored order in its own columns.
   * Under a view sort or a swimlane it isn't. See `useBoardView.dndDisabled`.
   */
  dragDisabled?: boolean;
}

/**
 * The stored values a card puts on screen, and nothing else.
 *
 * Deliberately not `extends Todo`. The card used to take a whole database row
 * as its props, so a new column on `todos` became a props change in a leaf
 * component and the card couldn't be rendered without a real row. This lists
 * the fields it actually reads, so it can be built by hand and a schema change
 * reaches it only through `toCardContent`.
 */
export interface TodoCardContent {
  title: string | null;
  /**
   * The rendered key (`KAN-12`), not its two halves. The prefix is a board
   * setting, so composing it here keeps the card rendering one value and keeps
   * the prefix's only reader on the board side of the boundary.
   *
   * Null while the insert is in flight: board_key is assigned by a trigger, so
   * an optimistic row has no key yet.
   */
  taskKey: string | null;
  workType: string | null;
  priority: string | null;
  dueDate: string | null;
  /**
   * Story points (M24-B). Reused straight off `TodoRow` rather than renamed
   * — unlike `taskKey`/`workType`/`dueDate`, there is no column-name-versus-
   * product-word gap here to cross.
   *
   * `null` means unestimated, distinct from a written `0` (M24-A). The card's
   * `EstimateControl` is the only reader; nothing here converts one into the
   * other.
   */
  estimate: number | null;
}
