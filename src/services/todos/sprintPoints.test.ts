import { describe, expect, it } from "vitest";

import type { IColumn, Todo } from "@/types/data";
import { EMPTY_POINTS, sprintPoints } from "./sprintPoints";

let seq = 0;

function todo(over: Partial<Todo> = {}): Todo {
  seq += 1;

  return {
    id: `t-${seq}`,
    board_id: "b-1",
    column_id: "col-todo",
    estimate: null,
    title: `todo ${seq}`,
    ...over,
  } as Todo;
}

const column = (id: string, category: string): IColumn =>
  ({ id, category, board_id: "b-1", title: id }) as IColumn;

const COLUMNS = [
  column("col-todo", "todo"),
  column("col-doing", "in_progress"),
  column("col-done", "done"),
];

describe("sprintPoints", () => {
  it("reports all-zero for an empty sprint", () => {
    expect(sprintPoints([], COLUMNS)).toEqual(EMPTY_POINTS);
  });

  it("sums estimated points, whatever column they sit in", () => {
    const items = [
      todo({ estimate: 3, column_id: "col-todo" }),
      todo({ estimate: 5, column_id: "col-doing" }),
    ];

    expect(sprintPoints(items, COLUMNS).total).toBe(8);
  });

  it("does not treat an unestimated item as zero points", () => {
    // The M24 rule this rollup must not silently violate.
    const items = [todo({ estimate: 3 }), todo({ estimate: null })];

    const result = sprintPoints(items, COLUMNS);

    expect(result.total).toBe(3);
    expect(result.unestimated).toBe(1);
  });

  it("counts a zero-point estimate as estimated, not missing", () => {
    const result = sprintPoints([todo({ estimate: 0 })], COLUMNS);

    expect(result.total).toBe(0);
    expect(result.unestimated).toBe(0);
  });

  it("sums completed points from done-category columns only", () => {
    const items = [
      todo({ estimate: 3, column_id: "col-done" }),
      todo({ estimate: 5, column_id: "col-doing" }),
      todo({ estimate: 2, column_id: "col-done" }),
    ];

    expect(sprintPoints(items, COLUMNS).completed).toBe(5);
  });

  it("computes remaining as total minus completed", () => {
    const items = [
      todo({ estimate: 3, column_id: "col-done" }),
      todo({ estimate: 5, column_id: "col-doing" }),
    ];

    const result = sprintPoints(items, COLUMNS);

    expect(result.total).toBe(8);
    expect(result.completed).toBe(3);
    expect(result.remaining).toBe(5);
  });

  it("reports zero remaining once every estimated item is done", () => {
    const items = [
      todo({ estimate: 3, column_id: "col-done" }),
      todo({ estimate: 5, column_id: "col-done" }),
    ];

    expect(sprintPoints(items, COLUMNS).remaining).toBe(0);
  });

  it("does not count a card with no column as done", () => {
    const items = [todo({ estimate: 3, column_id: null })];

    const result = sprintPoints(items, COLUMNS);

    expect(result.total).toBe(3);
    expect(result.completed).toBe(0);
  });

  it("survives a board with no done column", () => {
    const items = [todo({ estimate: 3, column_id: "col-todo" })];

    const result = sprintPoints(items, [column("col-todo", "todo")]);

    expect(result.completed).toBe(0);
    expect(result.remaining).toBe(3);
  });

  it("buckets points by category — the Jira reference's gray/blue/green", () => {
    const items = [
      todo({ estimate: 21, column_id: "col-todo" }),
      todo({ estimate: 1, column_id: "col-doing" }),
      todo({ estimate: 123, column_id: "col-done" }),
    ];

    const result = sprintPoints(items, COLUMNS);

    expect(result.todo).toBe(21);
    expect(result.inProgress).toBe(1);
    expect(result.done).toBe(123);
  });

  it("counts a column-less item as todo, not a fourth bucket", () => {
    const result = sprintPoints([todo({ estimate: 5, column_id: null })], COLUMNS);

    expect(result.todo).toBe(5);
    expect(result.inProgress).toBe(0);
    expect(result.done).toBe(0);
  });

  it("keeps done identical to completed", () => {
    const items = [
      todo({ estimate: 3, column_id: "col-done" }),
      todo({ estimate: 2, column_id: "col-done" }),
    ];

    const result = sprintPoints(items, COLUMNS);

    expect(result.done).toBe(result.completed);
  });
});
