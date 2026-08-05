import { describe, expect, it } from "vitest";

import type { ISupabaseTodo } from "../../types/data";
import { applyTodoDrop } from "./applyTodoDrop";

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

describe("applyTodoDrop", () => {
  describe("within one column", () => {
    it("moves the card to the requested index and renumbers", () => {
      const todos = board();
      const result = applyTodoDrop(todos, todos[2], "a", 0);

      expect(column(result, "a")).toEqual([3, 1, 2]);
      expect(positions(result, "a")).toEqual([0, 1, 2]);

      // The other columns are carried through untouched.
      expect(column(result, "b")).toEqual([4, 5]);
      expect(column(result, "c")).toEqual([6]);
    });

    it("is a no-op in effect when dropped on its own slot", () => {
      const todos = board();
      const result = applyTodoDrop(todos, todos[1], "a", 1);

      expect(column(result, "a")).toEqual([1, 2, 3]);
      expect(positions(result, "a")).toEqual([0, 1, 2]);
    });

    it("handles the last gap, whose index is the length without the card", () => {
      const todos = board();
      const result = applyTodoDrop(todos, todos[0], "a", 2);

      expect(column(result, "a")).toEqual([2, 3, 1]);
      expect(positions(result, "a")).toEqual([0, 1, 2]);
    });
  });

  describe("across columns", () => {
    it("lands at the index, carries the new column, and closes the gap left behind", () => {
      const todos = board();
      const result = applyTodoDrop(todos, todos[0], "b", 1);

      expect(column(result, "b")).toEqual([4, 1, 5]);
      expect(result.find((it) => it.id === 1)?.column_id).toBe("b");

      expect(column(result, "a")).toEqual([2, 3]);
      expect(positions(result, "a")).toEqual([0, 1]);
      expect(positions(result, "b")).toEqual([0, 1, 2]);

      expect(column(result, "c")).toEqual([6]);
    });

    it("handles an empty destination column", () => {
      const todos = board().filter((it) => it.column_id !== "c");
      const result = applyTodoDrop(todos, todos[0], "c", 0);

      expect(column(result, "c")).toEqual([1]);
      expect(positions(result, "c")).toEqual([0]);
      expect(column(result, "a")).toEqual([2, 3]);
    });
  });

  it("loses and duplicates nothing", () => {
    const todos = board();
    const result = applyTodoDrop(todos, todos[3], "a", 1);

    expect(result.length).toBe(todos.length);
    expect(new Set(result.map((it) => it.id)).size).toBe(todos.length);
  });

  describe("immutability", () => {
    // This is what makes rollback possible: onMutate snapshots the cached
    // array, and the cache holds these very objects. Renumbering in place
    // would corrupt the snapshot, leaving onError nothing to restore.
    it("never mutates the input", () => {
      const todos = board();
      const before = todos.map((it) => ({ ...it }));

      applyTodoDrop(todos, todos[0], "b", 0);

      expect(todos).toEqual(before);
    });

    it("returns fresh objects for every renumbered row", () => {
      const todos = board();
      const result = applyTodoDrop(todos, todos[0], "b", 0);

      const touched = result.filter(
        (row) => row.column_id === "a" || row.column_id === "b",
      );

      expect(touched.length).toBe(5);

      for (const row of touched) {
        expect(todos.some((original) => original === row)).toBe(false);
      }
    });

    it("shares untouched columns by reference, so React can skip them", () => {
      const todos = board();
      const result = applyTodoDrop(todos, todos[0], "b", 0);
      const untouched = result.find((row) => row.id === 6);

      expect(todos.some((original) => original === untouched)).toBe(true);
    });
  });
});
