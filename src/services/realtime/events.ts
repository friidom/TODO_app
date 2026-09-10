import {
  applyColumnDeleted,
  applyColumnInserted,
  applyColumnUpdated,
} from "@/services/columns/cache";
import {
  applyCommentDeleted,
  applyCommentInserted,
  applyCommentUpdated,
} from "@/services/comments/cache";
import {
  applyTodoDeleted,
  applyTodoInserted,
  applyTodoUpdated,
} from "@/services/todos/cache";
import type { Comment, IColumn, Todo } from "@/types/data";

// Turns a replication payload into a cache update, reusing the same apply* functions mutations use — no second definition of what a move means.
// Pure and never refetches; useBoardRealtime just hands off the payload and writes the result.

// old is partial — both tables are REPLICA IDENTITY DEFAULT, so a DELETE only carries the primary key.
export interface RowChange<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Partial<T>;
  old: Partial<T>;
}

// Echo rule: an INSERT whose id we already have is skipped, not applied — the client minted that uuid, so this is our own optimistic write coming back.
export function applyTodoEvent(todos: Todo[], change: RowChange<Todo>): Todo[] {
  if (change.eventType === "DELETE") {
    const id = change.old?.id;

    return id ? applyTodoDeleted(todos, id) : todos;
  }

  const row = change.new as Todo | undefined;

  if (!row?.id) return todos;

  const known = todos.some((todo) => todo.id === row.id);

  if (change.eventType === "INSERT") {
    return known ? todos : applyTodoInserted(todos, row);
  }

  // an UPDATE for a row we don't have means we missed the INSERT — dropped, not inserted; resync on re-subscribe handles it
  return known ? applyTodoUpdated(todos, row) : todos;
}

export function applyColumnEvent(
  columns: IColumn[],
  change: RowChange<IColumn>,
): IColumn[] {
  if (change.eventType === "DELETE") {
    const id = change.old?.id;

    return id ? applyColumnDeleted(columns, id) : columns;
  }

  const row = change.new as IColumn | undefined;

  if (!row?.id) return columns;

  const known = columns.some((column) => column.id === row.id);

  if (change.eventType === "INSERT") {
    return known ? columns : applyColumnInserted(columns, row);
  }

  return known ? applyColumnUpdated(columns, row) : columns;
}

export function applyCommentEvent(
  comments: Comment[],
  change: RowChange<Comment>,
): Comment[] {
  if (change.eventType === "DELETE") {
    const id = change.old?.id;

    return id ? applyCommentDeleted(comments, id) : comments;
  }

  const row = change.new as Comment | undefined;

  if (!row?.id) return comments;

  if (change.eventType === "INSERT") return applyCommentInserted(comments, row);

  return comments.some((comment) => comment.id === row.id)
    ? applyCommentUpdated(comments, row)
    : comments;
}
