/**
 * Self-check for `applyTodoDrop`. No test runner installed, so run it directly:
 *
 *   node --experimental-strip-types src/services/todos/applyTodoDrop.check.ts
 */
import assert from "node:assert/strict";

import type { ISupabaseTodo } from "../../types/data.ts";
import { applyTodoDrop } from "./applyTodoDrop.ts";

const todo = (id: number, column_id: string, position: number): ISupabaseTodo =>
  ({
    id,
    column_id,
    position,
    title: `todo ${id}`,
  }) as ISupabaseTodo;

/** Ids of a column, in stored order. */
const column = (todos: ISupabaseTodo[], columnId: string) =>
  todos
    .filter((it) => it.column_id === columnId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((it) => it.id);

/** Positions of a column, in stored order. */
const positions = (todos: ISupabaseTodo[], columnId: string) =>
  todos
    .filter((it) => it.column_id === columnId)
    .map((it) => it.position)
    .sort((a, b) => (a ?? 0) - (b ?? 0));

const board = () => [
  todo(1, "a", 0),
  todo(2, "a", 1),
  todo(3, "a", 2),
  todo(4, "b", 0),
  todo(5, "b", 1),
  todo(6, "c", 0),
];

// --- same column ------------------------------------------------------------

{
  const todos = board();
  const result = applyTodoDrop(todos, todos[2], "a", 0);

  assert.deepEqual(column(result, "a"), [3, 1, 2]);
  assert.deepEqual(positions(result, "a"), [0, 1, 2]);

  // The other columns are carried through untouched.
  assert.deepEqual(column(result, "b"), [4, 5]);
  assert.deepEqual(column(result, "c"), [6]);
}

{
  // Dropping onto its own slot is a no-op in effect.
  const todos = board();
  const result = applyTodoDrop(todos, todos[1], "a", 1);

  assert.deepEqual(column(result, "a"), [1, 2, 3]);
  assert.deepEqual(positions(result, "a"), [0, 1, 2]);
}

{
  // Last gap: index equals the length of the column without the card.
  const todos = board();
  const result = applyTodoDrop(todos, todos[0], "a", 2);

  assert.deepEqual(column(result, "a"), [2, 3, 1]);
  assert.deepEqual(positions(result, "a"), [0, 1, 2]);
}

// --- across columns ---------------------------------------------------------

{
  const todos = board();
  const result = applyTodoDrop(todos, todos[0], "b", 1);

  // Landed at the requested index, and carries its new column.
  assert.deepEqual(column(result, "b"), [4, 1, 5]);
  assert.equal(result.find((it) => it.id === 1)?.column_id, "b");

  // The source column closed the gap it left behind.
  assert.deepEqual(column(result, "a"), [2, 3]);
  assert.deepEqual(positions(result, "a"), [0, 1]);
  assert.deepEqual(positions(result, "b"), [0, 1, 2]);

  // Untouched column is still untouched.
  assert.deepEqual(column(result, "c"), [6]);
}

{
  // Into an empty column.
  const todos = board().filter((it) => it.column_id !== "c");
  const result = applyTodoDrop(todos, todos[0], "c", 0);

  assert.deepEqual(column(result, "c"), [1]);
  assert.deepEqual(positions(result, "c"), [0]);
  assert.deepEqual(column(result, "a"), [2, 3]);
}

// --- no row is lost or duplicated -------------------------------------------

{
  const todos = board();
  const result = applyTodoDrop(todos, todos[3], "a", 1);

  assert.equal(result.length, todos.length);
  assert.equal(new Set(result.map((it) => it.id)).size, todos.length);
}

// --- the input is never mutated ---------------------------------------------

// This is the one that matters for rollback: onMutate snapshots the cached
// array, and the cache holds these very objects. Renumbering in place would
// corrupt the snapshot, leaving onError nothing to restore.
{
  const todos = board();
  const before = todos.map((it) => ({ ...it }));

  applyTodoDrop(todos, todos[0], "b", 0);

  assert.deepEqual(todos, before);
}

{
  const todos = board();
  const result = applyTodoDrop(todos, todos[0], "b", 0);

  // Every row that was renumbered is a fresh object, so writing through the
  // result cannot reach back into the array onError restores.
  const touched = result.filter(
    (row) => row.column_id === "a" || row.column_id === "b",
  );

  assert.equal(touched.length, 5);

  for (const row of touched) {
    assert.equal(
      todos.some((original) => original === row),
      false,
    );
  }

  // Columns the move never touched are shared by reference, deliberately:
  // that structural sharing is what lets React skip re-rendering those cards.
  const untouched = result.find((row) => row.id === 6);

  assert.equal(
    todos.some((original) => original === untouched),
    true,
  );
}

console.log("applyTodoDrop: all checks passed");
