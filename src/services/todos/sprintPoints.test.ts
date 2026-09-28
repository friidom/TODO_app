import { describe, expect, it } from "vitest";

import type { IStatus, Todo } from "@/types/data";
import { EMPTY_POINTS, sprintPoints } from "./sprintPoints";

let seq = 0;

function todo(over: Partial<Todo> = {}): Todo {
  seq += 1;

  return {
    id: `t-${seq}`,
    board_id: "b-1",
    status_id: "st-todo",
    estimate: null,
    title: `todo ${seq}`,
    ...over,
  } as Todo;
}

const status = (id: string, category: IStatus["category"]): IStatus =>
  ({ id, category, board_id: "b-1", column_id: `column-of-${id}`, name: id }) as IStatus;

const STATUSES = [
  status("st-todo", "todo"),
  status("st-doing", "in_progress"),
  status("st-done", "done"),
];

describe("sprintPoints", () => {
  it("reports all-zero for an empty sprint", () => {
    expect(sprintPoints([], STATUSES)).toEqual(EMPTY_POINTS);
  });

  it("sums estimated points, whatever status they are in", () => {
    const items = [
      todo({ estimate: 3, status_id: "st-todo" }),
      todo({ estimate: 5, status_id: "st-doing" }),
    ];

    expect(sprintPoints(items, STATUSES).total).toBe(8);
  });

  it("does not treat an unestimated item as zero points", () => {
    const items = [todo({ estimate: 3 }), todo({ estimate: null })];

    const result = sprintPoints(items, STATUSES);

    expect(result.total).toBe(3);
    expect(result.unestimated).toBe(1);
  });

  it("counts a zero-point estimate as estimated, not missing", () => {
    const result = sprintPoints([todo({ estimate: 0 })], STATUSES);

    expect(result.total).toBe(0);
    expect(result.unestimated).toBe(0);
  });

  it("sums completed points from done-category statuses only", () => {
    const items = [
      todo({ estimate: 3, status_id: "st-done" }),
      todo({ estimate: 5, status_id: "st-doing" }),
      todo({ estimate: 2, status_id: "st-done" }),
    ];

    expect(sprintPoints(items, STATUSES).completed).toBe(5);
  });

  it("computes remaining as total minus completed", () => {
    const items = [
      todo({ estimate: 3, status_id: "st-done" }),
      todo({ estimate: 5, status_id: "st-doing" }),
    ];

    const result = sprintPoints(items, STATUSES);

    expect(result.total).toBe(8);
    expect(result.completed).toBe(3);
    expect(result.remaining).toBe(5);
  });

  it("reports zero remaining once every estimated item is done", () => {
    const items = [
      todo({ estimate: 3, status_id: "st-done" }),
      todo({ estimate: 5, status_id: "st-done" }),
    ];

    expect(sprintPoints(items, STATUSES).remaining).toBe(0);
  });

  it("does not count a card with no status as done", () => {
    const items = [todo({ estimate: 3, status_id: null })];

    const result = sprintPoints(items, STATUSES);

    expect(result.total).toBe(3);
    expect(result.completed).toBe(0);
  });

  it("survives a board with no done status", () => {
    const items = [todo({ estimate: 3, status_id: "st-todo" })];

    const result = sprintPoints(items, [status("st-todo", "todo")]);

    expect(result.completed).toBe(0);
    expect(result.remaining).toBe(3);
  });

  it("buckets points by category — the Jira reference's gray/blue/green", () => {
    const items = [
      todo({ estimate: 21, status_id: "st-todo" }),
      todo({ estimate: 1, status_id: "st-doing" }),
      todo({ estimate: 123, status_id: "st-done" }),
    ];

    const result = sprintPoints(items, STATUSES);

    expect(result.todo).toBe(21);
    expect(result.inProgress).toBe(1);
    expect(result.done).toBe(123);
  });

  it("counts a status-less item as todo, not a fourth bucket", () => {
    const result = sprintPoints([todo({ estimate: 5, status_id: null })], STATUSES);

    expect(result.todo).toBe(5);
    expect(result.inProgress).toBe(0);
    expect(result.done).toBe(0);
  });

  it("keeps done identical to completed", () => {
    const items = [
      todo({ estimate: 3, status_id: "st-done" }),
      todo({ estimate: 2, status_id: "st-done" }),
    ];

    const result = sprintPoints(items, STATUSES);

    expect(result.done).toBe(result.completed);
  });
});
