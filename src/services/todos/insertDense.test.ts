import { describe, expect, it } from "vitest";

import { insertDense } from "./insertDense";
import type { ISupabaseTodo } from "../../types/data";

// Ids are uuids (M2-14); stringified here so the expectations stay readable.
const todo = (id: number, position: number) =>
  ({ id: String(id), position, column_id: "c" }) as ISupabaseTodo;

const column = [todo(1, 0), todo(2, 1), todo(3, 2)];
const fresh = todo(99, 0);

const order = (todos: ISupabaseTodo[]) => todos.map((t) => Number(t.id));
const positions = (todos: ISupabaseTodo[]) => todos.map((t) => t.position);

describe("insertDense", () => {
  it("inserts at the gap the user clicked", () => {
    expect(order(insertDense(column, fresh, 0))).toEqual([99, 1, 2, 3]);
    expect(order(insertDense(column, fresh, 2))).toEqual([1, 2, 99, 3]);
    expect(order(insertDense(column, fresh, 3))).toEqual([1, 2, 3, 99]);
  });

  it("appends when no index is given", () => {
    expect(order(insertDense(column, fresh))).toEqual([1, 2, 3, 99]);
  });

  it("keeps positions dense wherever the card lands", () => {
    for (const index of [0, 1, 2, 3, undefined]) {
      expect(positions(insertDense(column, fresh, index))).toEqual([
        0, 1, 2, 3,
      ]);
    }
  });

  it("handles an empty column", () => {
    expect(order(insertDense([], fresh, 0))).toEqual([99]);
  });

  it("sorts unsorted input, so a gap index still means 'after the Nth card'", () => {
    expect(
      order(insertDense([todo(3, 2), todo(1, 0), todo(2, 1)], fresh, 1)),
    ).toEqual([1, 99, 2, 3]);
  });

  it("never mutates the source array", () => {
    expect(positions(column)).toEqual([0, 1, 2]);
    expect(column.length).toBe(3);
  });
});
