import { describe, expect, it } from "vitest";

import { insertionIndex, reorder, stepGap } from "./reorder";

describe("reorder", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves an item before or after another", () => {
    expect(reorder(ids, "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
    expect(reorder(ids, "d", "b", "before")).toEqual(["a", "d", "b", "c"]);
    expect(reorder(ids, "b", "d", "after")).toEqual(["a", "c", "d", "b"]);
  });

  it("leaves the list alone for a drop on itself or an unknown id", () => {
    expect(reorder(ids, "b", "b", "after")).toEqual(ids);
    expect(reorder(ids, "x", "b", "after")).toEqual(ids);
    expect(reorder(ids, "b", "x", "after")).toEqual(ids);
  });

  it("does not mutate its input", () => {
    const input = [...ids];

    reorder(input, "a", "d", "after");

    expect(input).toEqual(ids);
  });
});

describe("insertionIndex", () => {
  it("counts without the dragged item", () => {
    expect(insertionIndex(["a", "b", "c"], "a", "c", "after")).toBe(2);
    expect(insertionIndex(["a", "b", "c"], "c", "a", "before")).toBe(0);
    expect(insertionIndex(["a", "b", "c"], "x", "b", "after")).toBe(2);
    expect(insertionIndex(["a", "b", "c"], "a", "x", "after")).toBe(2);
  });
});

describe("stepGap", () => {
  it("steps over the two gaps touching the dragged item", () => {
    // 4 items, dragging index 1: gaps 1 and 2 are where it already sits
    expect(stepGap(4, 1, 2, 1)).toBe(3);
    expect(stepGap(4, 1, 1, -1)).toBe(0);
    expect(stepGap(4, 1, 3, -1)).toBe(0);
  });

  it("stops at the ends rather than wrapping", () => {
    expect(stepGap(4, 1, 4, 1)).toBeNull();
    expect(stepGap(4, 1, 0, -1)).toBeNull();
    expect(stepGap(2, 0, 1, 1)).toBe(2);
  });
});
