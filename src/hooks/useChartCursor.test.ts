import { describe, expect, it } from "vitest";

import { stepCursor } from "./useChartCursor";

describe("stepCursor", () => {
  it("walks one point per arrow and stops at either end", () => {
    expect(stepCursor(3, "ArrowLeft", 10)).toBe(2);
    expect(stepCursor(3, "ArrowRight", 10)).toBe(4);
    expect(stepCursor(0, "ArrowLeft", 10)).toBe(0);
    expect(stepCursor(9, "ArrowRight", 10)).toBe(9);
  });

  it("jumps to the first and last point", () => {
    expect(stepCursor(4, "Home", 10)).toBe(0);
    expect(stepCursor(4, "End", 10)).toBe(9);
  });

  it("ignores other keys and an empty chart", () => {
    expect(stepCursor(4, "Enter", 10)).toBeNull();
    expect(stepCursor(0, "ArrowRight", 0)).toBeNull();
  });
});
