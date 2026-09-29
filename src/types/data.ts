import type { ColumnCategory } from "@/constants/columns";

import type { Database } from "./database";

type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

// Derived from database.ts (npm run db:types) — don't hand-edit, fix the schema instead.

export type TodoRow = Row<"todos">;

// The board's narrow slice, not the full row — description is not fetched here.
export const TODO_FIELDS = [
  "id",
  "board_id",
  "status_id",
  "position",
  "rank",
  "board_key",
  "title",
  "type",
  "priority",
  "start_date",
  "due_date",
  "assignee_id",
  "estimate",
  "parent_id",
  "sprint_id",
  "backlog_rank",
  // creator_id is here for the predefined filters ("Reported by me"). The
  // backend's LIST_FIELDS records why it joined the list projection.
  "creator_id",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof TodoRow)[];

// completed_at is the other field the filters need ("Resolved recently"), and it
// cannot go in the list above: that list must be TodoRow's own keys, and
// database.ts predates the column (migration 0012) exactly as it predates
// started_at. Bolted on here for the same reason IBoard's feature flags are.
export type Todo = Pick<TodoRow, (typeof TODO_FIELDS)[number]> & {
  completed_at: string | null;
};

// GET /todos/:id — the list projection plus description (backend DETAIL_FIELDS).
export type TodoDetail = Todo & Pick<TodoRow, "description" | "archived">;

export type Sprint = Row<"sprints">;

export type Activity = Row<"activities">;

export type Comment = Row<"comments">;

// board_id is here for the RLS policy, not for readers — denormalised from the todo.
export type Attachment = Row<"attachments">;

export type ISupabaseProfile = Row<"profiles">;

export type IColumn = Row<"columns">;

// Declared by hand for the reason IBoard's flags are below: database.ts is the
// Supabase-era generator's output, and statuses arrived long after it (0024).
// A card's status is its own row now; a column only shows statuses, and the
// category the old column carried lives here.
export interface IStatus {
  id: string;
  board_id: string;
  // null is an unmapped status: part of the workflow, shown on no column, and
  // unable to receive work until it is dragged into one.
  column_id: string | null;
  // User data: rendered as typed, never through t().
  name: string;
  category: ColumnCategory;
  // Order inside its column; board order is column rank, then this.
  rank: number;
  // Retired from new placement. Cards already in it stay valid and keep
  // rendering in its column.
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

// GET /boards/:boardId/workflow — one snapshot, so workflow_version always
// describes exactly the columns and statuses beside it.
export interface ITransition {
  from: string;
  to: string;
}

export interface IWorkflow {
  workflow_version: number;
  columns: IColumn[];
  statuses: IStatus[];
  // Every allowed move. A pair that is absent is refused by the API.
  transitions: ITransition[];
}

// One entry of boards.view_tabs (0027). mode is a string, not a ViewMode: the
// server does not know the view list, so a stale mode is repaired on read.
export interface StoredViewTab {
  mode: string;
  label: string | null;
  hidden: boolean;
}

// The feature flags are declared here rather than in database.ts for the reason
// ISpace's note below gives: that file is the Supabase-era generator's output and
// carries nothing added since. Board Settings > Features writes both (0020).
export type IBoard = Row<"boards"> & {
  sprints_enabled: boolean;
  workflow_enabled: boolean;
  // Optional because an optimistic board is built before the server answers;
  // absent reads as null, the default tab set.
  view_tabs?: StoredViewTab[] | null;
};

// Owner-only by RLS and not a permission scope — filing a board into a space grants nobody access to it.
// database.ts is the Supabase-era generator's output and carries nothing added after it
// (todos.started_at is missing the same way), so the schema no longer regenerates it —
// which is why IBoard above bolts its newer columns on by hand.
// The workflow setting moved to the board in 0020: a space is a folder, not a project.
export type ISpace = Row<"spaces">;

// Client-only UI state, kept off Todo so a DB row and a UI concern aren't one shape.
export interface TodoViewState {
  dragging?: boolean;
  overlay?: boolean;
  dragDisabled?: boolean;
}

// The fields a card actually renders — not `extends Todo`, so a new column doesn't ripple into every card.
export interface TodoCardContent {
  title: string | null;
  // Null while the insert is in flight — board_key is trigger-assigned.
  taskKey: string | null;
  workType: string | null;
  priority: string | null;
  dueDate: string | null;
  // null means unestimated, distinct from a written 0.
  estimate: number | null;
}
