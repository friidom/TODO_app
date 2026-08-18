import { describe, expect, it } from "vitest";

import {
  isArrowKey,
  nextColumnGap,
  nextTodoGap,
  type GapRef,
} from "./keyboardDrag";

/**
 * A column of gaps around cards. `cards` are the ids top to bottom, so a column
 * of two cards has three gaps: above the first, between them, below the second.
 * That is exactly the shape `DropZone` mounts on the board.
 */
function column(columnId: string, cards: string[]): GapRef[] {
  return Array.from({ length: cards.length + 1 }, (_, index) => ({
    id: `todo-gap:${columnId}:${index}`,
    columnId,
    index,
    beforeId: cards[index - 1] ?? null,
    afterId: cards[index] ?? null,
  }));
}

/** Gaps between columns, the `column-gap:<index>` droppables. */
function columnGaps(columns: string[]): GapRef[] {
  return Array.from({ length: columns.length + 1 }, (_, index) => ({
    id: `column-gap:${index}`,
    columnId: null,
    index,
    beforeId: columns[index - 1] ?? null,
    afterId: columns[index] ?? null,
  }));
}

describe("isArrowKey", () => {
  it("claims the four arrows and nothing else", () => {
    // Everything else has to reach the browser: Space and Enter drop, Escape
    // cancels, and Tab must still move focus.
    expect(isArrowKey("ArrowUp")).toBe(true);
    expect(isArrowKey("ArrowRight")).toBe(true);
    expect(isArrowKey("Escape")).toBe(false);
    expect(isArrowKey("Tab")).toBe(false);
    expect(isArrowKey(" ")).toBe(false);
  });
});

describe("nextTodoGap — within a column", () => {
  // Card "b" is being dragged: it sits against gaps 1 and 2.
  const gaps = column("c1", ["a", "b", "c"]);
  const columns = ["c1", "c2"];

  it("STEPS OVER THE GAPS THE CARD ALREADY SITS AGAINST", () => {
    // From gap 1 (immediately above "b"), one press down must land at gap 3 —
    // below "c". Gap 2 is the other side of the card being dragged, so
    // stopping there would be a press that visibly did nothing.
    const result = nextTodoGap(
      gaps,
      columns,
      { columnId: "c1", index: 1 },
      "ArrowDown",
      "b",
    );

    expect(result?.index).toBe(3);
  });

  it("moves up past the card's own gaps too", () => {
    const result = nextTodoGap(
      gaps,
      columns,
      { columnId: "c1", index: 2 },
      "ArrowUp",
      "b",
    );

    expect(result?.index).toBe(0);
  });

  it("stops at the top rather than wrapping", () => {
    expect(
      nextTodoGap(gaps, columns, { columnId: "c1", index: 0 }, "ArrowUp", "b"),
    ).toBeNull();
  });

  it("stops at the bottom rather than wrapping", () => {
    expect(
      nextTodoGap(
        gaps,
        columns,
        { columnId: "c1", index: 3 },
        "ArrowDown",
        "b",
      ),
    ).toBeNull();
  });

  it("moves one gap at a time when the dragged card is elsewhere", () => {
    // Dragging a card from another column through this one: no gap here
    // touches it, so every press advances by exactly one.
    const result = nextTodoGap(
      gaps,
      columns,
      { columnId: "c1", index: 1 },
      "ArrowDown",
      "from-another-column",
    );

    expect(result?.index).toBe(2);
  });
});

describe("nextTodoGap — across columns", () => {
  const gaps = [...column("c1", ["a", "b"]), ...column("c2", ["x", "y", "z"])];
  const columns = ["c1", "c2"];

  it("keeps the depth when moving sideways", () => {
    const result = nextTodoGap(
      gaps,
      columns,
      { columnId: "c1", index: 1 },
      "ArrowRight",
      "b",
    );

    expect(result?.columnId).toBe("c2");
    expect(result?.index).toBe(1);
  });

  it("clamps the depth to what the destination has", () => {
    // c2 has four gaps (0-3); coming from depth 2 in a taller column would
    // otherwise ask for one that does not exist.
    const tall = [
      ...column("c1", ["a", "b", "c", "d"]),
      ...column("c2", ["x"]),
    ];

    const result = nextTodoGap(
      tall,
      columns,
      { columnId: "c1", index: 4 },
      "ArrowRight",
      "a",
    );

    expect(result?.columnId).toBe("c2");
    expect(result?.index).toBe(1);
  });

  it("refuses to move past the last column", () => {
    expect(
      nextTodoGap(
        gaps,
        columns,
        { columnId: "c2", index: 0 },
        "ArrowRight",
        "x",
      ),
    ).toBeNull();
  });

  it("refuses to move before the first column", () => {
    expect(
      nextTodoGap(
        gaps,
        columns,
        { columnId: "c1", index: 0 },
        "ArrowLeft",
        "a",
      ),
    ).toBeNull();
  });

  it("refuses a column that has no gaps at all", () => {
    const result = nextTodoGap(
      column("c1", ["a"]),
      ["c1", "empty"],
      { columnId: "c1", index: 0 },
      "ArrowRight",
      "a",
    );

    expect(result).toBeNull();
  });

  it("returns null for a column the board does not have", () => {
    expect(
      nextTodoGap(
        gaps,
        columns,
        { columnId: "gone", index: 0 },
        "ArrowRight",
        "a",
      ),
    ).toBeNull();
  });
});

describe("nextColumnGap", () => {
  // Column "b" is being dragged: it sits against gaps 1 and 2.
  const gaps = columnGaps(["a", "b", "c"]);

  it("steps over the gaps the column already sits against", () => {
    expect(nextColumnGap(gaps, 1, "ArrowRight", "b")?.index).toBe(3);
    expect(nextColumnGap(gaps, 2, "ArrowLeft", "b")?.index).toBe(0);
  });

  it("stops at both ends rather than wrapping", () => {
    expect(nextColumnGap(gaps, 0, "ArrowLeft", "b")).toBeNull();
    expect(nextColumnGap(gaps, 3, "ArrowRight", "b")).toBeNull();
  });

  it("IGNORES UP AND DOWN — columns are a horizontal list", () => {
    // Not "does something arbitrary": a vertical key with no vertical meaning
    // must leave the drag exactly where it is.
    expect(nextColumnGap(gaps, 1, "ArrowUp", "b")).toBeNull();
    expect(nextColumnGap(gaps, 1, "ArrowDown", "b")).toBeNull();
  });
});
