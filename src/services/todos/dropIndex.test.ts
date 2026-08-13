import { describe, expect, it } from "vitest";

import type { ISupabaseTodo } from "../../types/data";
import { applyTodoMoved } from "./cache";
import { resolveDropIndex } from "./dropIndex";

const todo = (id: string, position: number): ISupabaseTodo =>
  ({ id, column_id: "a", position, title: `todo ${id}` }) as ISupabaseTodo;

/** `[A, B, C, D]` in one column, stored in that order. */
const column = () => [todo("A", 0), todo("B", 1), todo("C", 2), todo("D", 3)];

/** Ids of a column after a move, in stored order. */
const order = (todos: ISupabaseTodo[], columnId: string) =>
  todos
    .filter((it) => it.column_id === columnId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((it) => it.id);

describe("resolveDropIndex", () => {
  describe("with nothing filtered — visible is the whole column", () => {
    it("keeps an upward move where the line was drawn", () => {
      const full = column();

      // Gap 1 sits between A and B. Dragging C there means "above B".
      expect(resolveDropIndex(full, full, 1, "C")).toBe(1);
    });

    // The bug this function exists to fix. Gap 3 sits between C and D, so a card
    // dropped there belongs above D — but the raw gap index, counted over a list
    // that still contains the dragged card, was one too many once the card was
    // removed.
    it("corrects a downward move that used to overshoot", () => {
      const full = column();

      expect(resolveDropIndex(full, full, 3, "A")).toBe(2);

      // End to end: A between C and D is [B, C, A, D], not [B, C, D, A].
      const moved = applyTodoMoved(
        full,
        full[0],
        "a",
        resolveDropIndex(full, full, 3, "A"),
      );

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
    // The dragged card is not in the destination, so nothing is removed and the
    // anchor's own index is the answer.
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
    // The user sees [A, D] and drops between them. That gap means "above D",
    // which is index 3 of the real column — not index 1, which is where the
    // rendered count would have put it, on top of B.
    it("counts hidden rows the user cannot see", () => {
      const full = column();
      const visible = [full[0], full[3]];

      expect(resolveDropIndex(full, visible, 1, "X")).toBe(3);
    });

    it("still appends past the last visible card", () => {
      const full = column();
      const visible = [full[0], full[1]];

      // Below B, with C and D hidden beneath it, means the end of the column —
      // there is no card to name, and the alternative would be silently
      // choosing one of the two the user cannot see.
      expect(resolveDropIndex(full, visible, 2, "X")).toBe(4);
    });

    it("drops into a column whose every row is filtered out", () => {
      const full = column();

      expect(resolveDropIndex(full, [], 0, "X")).toBe(4);
    });

    it("removes the dragged card first, even when it is hidden from view", () => {
      const full = column();
      const visible = [full[1], full[3]];

      // Dropping A above D: D is at index 3 of the full column, index 2 once A
      // is taken out.
      expect(resolveDropIndex(full, visible, 1, "A")).toBe(2);
    });
  });

  it("appends rather than misplacing when the anchor is the dragged card", () => {
    // Unreachable from the board — `touchesActive` suppresses the gaps either
    // side of the dragged card — but answering it is what keeps this function
    // independent of that suppression.
    const full = column();

    expect(resolveDropIndex(full, full, 0, "A")).toBe(3);
  });
});
