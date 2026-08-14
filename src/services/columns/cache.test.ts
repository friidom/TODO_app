import { describe, expect, it } from "vitest";

import type { IColumn } from "../../types/data";
import {
  applyColumnDeleted,
  applyColumnInserted,
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
