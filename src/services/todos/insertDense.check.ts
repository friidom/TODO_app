/**
 * Self-check for `insertDense`. No test runner installed, so run it directly:
 *
 *   node --experimental-strip-types src/services/todos/insertDense.check.ts
 */
import assert from "node:assert/strict";

import { insertDense } from "./insertDense.ts";
import type { ISupabaseTodo } from "../../types/data";

const todo = (id: number, position: number) =>
  ({ id, position, column_id: "c" }) as ISupabaseTodo;

const column = [todo(1, 0), todo(2, 1), todo(3, 2)];
const fresh = todo(99, 0);

const order = (todos: ISupabaseTodo[]) => todos.map((t) => t.id);
const positions = (todos: ISupabaseTodo[]) => todos.map((t) => t.position);

// inserts at the gap the user clicked
assert.deepEqual(order(insertDense(column, fresh, 0)), [99, 1, 2, 3]);
assert.deepEqual(order(insertDense(column, fresh, 2)), [1, 2, 99, 3]);
assert.deepEqual(order(insertDense(column, fresh, 3)), [1, 2, 3, 99]);

// no index means append
assert.deepEqual(order(insertDense(column, fresh)), [1, 2, 3, 99]);

// positions stay dense wherever it lands
for (const index of [0, 1, 2, 3, undefined]) {
  assert.deepEqual(positions(insertDense(column, fresh, index)), [0, 1, 2, 3]);
}

// empty column
assert.deepEqual(order(insertDense([], fresh, 0)), [99]);

// unsorted input is sorted before splicing, so the gap index still means
// "after the Nth visible card"
assert.deepEqual(
  order(insertDense([todo(3, 2), todo(1, 0), todo(2, 1)], fresh, 1)),
  [1, 99, 2, 3],
);

// the source array is never mutated
assert.deepEqual(positions(column), [0, 1, 2]);
assert.equal(column.length, 3);

console.log("insertDense: all checks passed");
