import type { Todo } from "@/types/data";
import { insertDense } from "./insertDense";

// Every way the ["todos", boardId] cache entry changes, as pure functions — shared by mutations and the realtime handler.
// (todos, ...) => todos, no mutation of the input, untouched rows passed through by reference so React skips re-rendering them.

export function applyTodoInserted(
  todos: Todo[],
  todo: Todo,
  index?: number,
): Todo[] {
  const destination = todos.filter((it) => it.column_id === todo.column_id);
  const untouched = todos.filter((it) => it.column_id !== todo.column_id);

  return [...untouched, ...insertDense(destination, todo, index)];
}

// Appended, never bucketed through insertDense — a subtask has a column_id for status but isn't drawn or dragged in that column.
export function applySubtaskInserted(todos: Todo[], subtask: Todo): Todo[] {
  if (todos.some((todo) => todo.id === subtask.id)) return todos;

  return [...todos, subtask];
}

// Swaps the pending optimistic row for the server's, keeping the client-picked position/rank so the card doesn't jump to the bottom.
export function applyTodoConfirmed(todos: Todo[], serverTodo: Todo): Todo[] {
  const pending = todos.find((todo) => todo.id === serverTodo.id);

  const position = pending?.position ?? serverTodo.position;
  const rank = pending?.rank ?? serverTodo.rank;

  return todos.map((todo) =>
    todo.id === serverTodo.id ? { ...serverTodo, position, rank } : todo,
  );
}

export function applyTodoUpdated(todos: Todo[], row: Todo): Todo[] {
  return todos.map((todo) => (todo.id === row.id ? row : todo));
}

export function applyTodoDeleted(todos: Todo[], id: Todo["id"]): Todo[] {
  return todos.filter((todo) => todo.id !== id);
}

// One row changes, everything else passed through by reference — no renumbering the whole column, which is what let two editors clobber each other.
export function applyTodoMoved(
  todos: Todo[],
  activeTodo: Todo,
  columnId: string,
  rank: number,
): Todo[] {
  return todos.map((todo) =>
    todo.id === activeTodo.id ? { ...todo, column_id: columnId, rank } : todo,
  );
}

export function applyBacklogMoved(
  todos: Todo[],
  todoId: string,
  patch: Partial<Pick<Todo, "sprint_id" | "column_id" | "rank" | "backlog_rank">>,
): Todo[] {
  return todos.map((todo) =>
    todo.id === todoId ? { ...todo, ...patch } : todo,
  );
}
