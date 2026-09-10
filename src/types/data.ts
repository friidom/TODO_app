import type { Database } from "./database";

type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

// Derived from database.ts (npm run db:types) — don't hand-edit, fix the schema instead.

export type TodoRow = Row<"todos">;

// The board's narrow slice, not the full row — description/archived/creator_id/status aren't fetched here.
export const TODO_FIELDS = [
  "id",
  "board_id",
  "column_id",
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
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof TodoRow)[];

export type Todo = Pick<TodoRow, (typeof TODO_FIELDS)[number]>;

export type Sprint = Row<"sprints">;

export type Activity = Row<"activities">;

export type Comment = Row<"comments">;

// board_id is here for the RLS policy, not for readers — denormalised from the todo.
export type Attachment = Row<"attachments">;

export type ISupabaseProfile = Row<"profiles">;

export type IColumn = Row<"columns">;

export type IBoard = Row<"boards">;

// Owner-only by RLS and not a permission scope — filing a board into a space grants nobody access to it.
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
