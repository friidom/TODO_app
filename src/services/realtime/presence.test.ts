import { describe, expect, it } from "vitest";

import { sameViewers } from "./presence";

describe("sameViewers", () => {
  it("holds the render guard: an identical roster under a new reference", () => {
    // every presence:sync arrives as a fresh array — this must return true or the board repaints for nothing
    const a = ["u1", "u2"];
    const b = ["u1", "u2"];

    expect(a).not.toBe(b);
    expect(sameViewers(a, b)).toBe(true);
  });

  it("sees an arrival", () => {
    expect(sameViewers(["u1"], ["u1", "u2"])).toBe(false);
  });

  it("sees a departure", () => {
    expect(sameViewers(["u1", "u2"], ["u1"])).toBe(false);
  });

  it("sees a swap that keeps the count", () => {
    expect(sameViewers(["u1", "u2"], ["u1", "u3"])).toBe(false);
  });

  it("treats two empty rosters as equal", () => {
    expect(sameViewers([], [])).toBe(true);
  });

  it("compares element-wise, which the server's sort is what licenses", () => {
    expect(sameViewers(["u1", "u2"], ["u1", "u2"])).toBe(true);
    expect(sameViewers(["u1", "u2"], ["u2", "u1"])).toBe(false);
  });
});
