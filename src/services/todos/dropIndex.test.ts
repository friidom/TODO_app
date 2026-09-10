import { describe, expect, it } from "vitest";

import type { Todo } from "../../types/data";
import { applyTodoMoved } from "./cache";
import { resolveDropIndex } from "./dropIndex";
import { byRank, rankForDrop } from "../../utils/rank";

const todo = (id: string, position: number): Todo =>
  ({
    id,
    column_id: "a",
    position,
    rank: (position + 1) * 1024,
    title: `todo ${id}`,
  }) as Todo;

const column = () => [todo("A", 0), todo("B", 1), todo("C", 2), todo("D", 3)];

const order = (todos: Todo[], columnId: string) =>
  todos
    .filter((it) => it.column_id === columnId)
    .sort(byRank)
    .map((it) => it.id);

describe("resolveDropIndex", () => {
  describe("with nothing filtered — visible is the whole column", () => {
    it("keeps an upward move where the line was drawn", () => {
      const full = column();

      expect(resolveDropIndex(full, full, 1, "C")).toBe(1);
    });

    // the off-by-one this function fixes: a gap index counted with the dragged card still in the list overshoots by one
    it("corrects a downward move that used to overshoot", () => {
      const full = column();

      expect(resolveDropIndex(full, full, 3, "A")).toBe(2);

      const index = resolveDropIndex(full, full, 3, "A");
      const destination = full.filter((it) => it.id !== "A");
      const rank = rankForDrop(destination, index);

      expect(rank).not.toBeNull();

      const moved = applyTodoMoved(full, full[0], "a", rank!);

      expect(order(moved, "a")).toEqual(["B", "C", "A", "D"]);
    });

    it("appends at the last gap, which is what splice used to do by luck", () => {
      const full = column();

      expect(resolveDropIndex(full, full, 4, "A")).toBe(3);
    });

    it("puts a card at the top from gap zero", () => {
      const full = column();

      expect(resolveDropIndex(full, full, 0, "D")).toBe(0);
    });
  });

  describe("across columns", () => {
    it("uses the anchor's index unchanged", () => {
      const destination = [todo("X", 0), todo("Y", 1)];

      expect(resolveDropIndex(destination, destination, 1, "A")).toBe(1);
      expect(resolveDropIndex(destination, destination, 2, "A")).toBe(2);
    });

    it("lands at zero in an empty destination", () => {
      expect(resolveDropIndex([], [], 0, "A")).toBe(0);
    });
  });

  describe("with a filter hiding rows", () => {
    // user sees [A, D], drops between them — that's index 3 of the real column, not 1
    it("counts hidden rows the user cannot see", () => {
      const full = column();
      const visible = [full[0], full[3]];

      expect(resolveDropIndex(full, visible, 1, "X")).toBe(3);
    });

    it("still appends past the last visible card", () => {
      const full = column();
      const visible = [full[0], full[1]];

      expect(resolveDropIndex(full, visible, 2, "X")).toBe(4);
    });

    it("drops into a column whose every row is filtered out", () => {
      const full = column();

      expect(resolveDropIndex(full, [], 0, "X")).toBe(4);
    });

    it("removes the dragged card first, even when it is hidden from view", () => {
      const full = column();
      const visible = [full[1], full[3]];

      expect(resolveDropIndex(full, visible, 1, "A")).toBe(2);
    });
  });

  it("appends rather than misplacing when the anchor is the dragged card", () => {
    // unreachable from the board (touchesActive suppresses it), but keeps this function correct independent of that
    const full = column();

    expect(resolveDropIndex(full, full, 0, "A")).toBe(3);
  });
});
