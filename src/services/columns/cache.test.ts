import { describe, expect, it } from "vitest";

import type { IColumn } from "../../types/data";
import {
  applyColumnDeleted,
  applyColumnInserted,
  applyColumnMoved,
  applyColumnUpdated,
} from "./cache";

const col = (id: string, position: number): IColumn =>
  ({
    id,
    position,
    title: id.toUpperCase(),
  }) as IColumn;

/** Ids in stored order. */
const order = (columns: IColumn[]) =>
  columns
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((it) => it.id);

const positions = (columns: IColumn[]) =>
  columns.map((it) => it.position).sort((a, b) => (a ?? 0) - (b ?? 0));

const board = () => [col("a", 0), col("b", 1), col("c", 2), col("d", 3)];

describe("applyColumnInserted", () => {
  it("appends the new column", () => {
    const columns = board();
    const result = applyColumnInserted(columns, col("e", 4));

    expect(order(result)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("opens an empty board", () => {
    expect(order(applyColumnInserted([], col("a", 0)))).toEqual(["a"]);
  });

  it("never mutates the input", () => {
    const columns = board();

    applyColumnInserted(columns, col("e", 4));

    expect(columns.length).toBe(4);
  });
});

describe("applyColumnUpdated", () => {
  it("merges the patch into the column that shares the id", () => {
    const result = applyColumnUpdated(board(), { id: "b", title: "Renamed" });

    expect(result.find((it) => it.id === "b")?.title).toBe("Renamed");
  });

  it("leaves fields the patch omits alone", () => {
    // A rename does not carry the limits, which is why this merges rather
    // than replaces.
    const columns = [{ ...col("a", 0), max_limit: 5 }];
    const result = applyColumnUpdated(columns, { id: "a", title: "Renamed" });

    expect(result[0].max_limit).toBe(5);
    expect(result[0].title).toBe("Renamed");
  });

  it("leaves the other columns alone", () => {
    const columns = board();
    const result = applyColumnUpdated(columns, { id: "b", title: "Renamed" });

    expect(order(result)).toEqual(["a", "b", "c", "d"]);
    expect(result.find((it) => it.id === "c")).toBe(columns[2]);
  });

  it("changes nothing when the id does not match", () => {
    const columns = board();

    expect(applyColumnUpdated(columns, { id: "zz" })).toEqual(columns);
  });

  it("never mutates the input", () => {
    const columns = board();
    const before = columns.map((it) => ({ ...it }));

    applyColumnUpdated(columns, { id: "b", title: "Renamed" });

    expect(columns).toEqual(before);
  });
});

describe("applyColumnDeleted", () => {
  it("removes the column and closes the gap its position left", () => {
    const result = applyColumnDeleted(board(), "b");

    expect(order(result)).toEqual(["a", "c", "d"]);
    expect(positions(result)).toEqual([0, 1, 2]);
  });

  it("sorts before renumbering, so an unordered cache still comes out dense", () => {
    const result = applyColumnDeleted(board().reverse(), "b");

    expect(order(result)).toEqual(["a", "c", "d"]);
    expect(positions(result)).toEqual([0, 1, 2]);
  });

  it("renumbers even when nothing matched", () => {
    const result = applyColumnDeleted(board(), "zz");

    expect(order(result)).toEqual(["a", "b", "c", "d"]);
    expect(positions(result)).toEqual([0, 1, 2, 3]);
  });

  it("never mutates the input", () => {
    const columns = board();
    const before = columns.map((it) => ({ ...it }));

    applyColumnDeleted(columns, "b");

    expect(columns).toEqual(before);
  });
});

describe("applyColumnMoved", () => {
  it("moves a column left and renumbers", () => {
    const result = applyColumnMoved(board(), 2, 1);

    expect(order(result)).toEqual(["a", "c", "b", "d"]);
    expect(positions(result)).toEqual([0, 1, 2, 3]);
  });

  it("moves a column right and renumbers", () => {
    const result = applyColumnMoved(board(), 1, 2);

    expect(order(result)).toEqual(["a", "c", "b", "d"]);
    expect(positions(result)).toEqual([0, 1, 2, 3]);
  });

  it("moves the first column to the end", () => {
    const result = applyColumnMoved(board(), 0, 3);

    expect(order(result)).toEqual(["b", "c", "d", "a"]);
    expect(positions(result)).toEqual([0, 1, 2, 3]);
  });

  it("moves the last column to the front", () => {
    const result = applyColumnMoved(board(), 3, 0);

    expect(order(result)).toEqual(["d", "a", "b", "c"]);
    expect(positions(result)).toEqual([0, 1, 2, 3]);
  });

  it("indexes the sorted order, not the array order", () => {
    // The drag paths pass an already-sorted list; a realtime handler reading
    // straight from the cache does not.
    const result = applyColumnMoved(board().reverse(), 0, 3);

    expect(order(result)).toEqual(["b", "c", "d", "a"]);
  });

  it("is a no-op when the column is put back where it was", () => {
    const result = applyColumnMoved(board(), 1, 1);

    expect(order(result)).toEqual(["a", "b", "c", "d"]);
    expect(positions(result)).toEqual([0, 1, 2, 3]);
  });

  it("returns the input untouched when `from` is out of range", () => {
    const columns = board();

    // The alternative is splicing `undefined` into the board.
    expect(applyColumnMoved(columns, 9, 0)).toBe(columns);
  });

  it("never mutates the input", () => {
    const columns = board();
    const before = columns.map((it) => ({ ...it }));

    applyColumnMoved(columns, 0, 3);

    expect(columns).toEqual(before);
  });
});
