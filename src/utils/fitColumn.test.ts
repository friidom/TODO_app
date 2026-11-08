import { describe, expect, it } from "vitest";

import { fitWidth, sample } from "./fitColumn";

describe("fitWidth", () => {
  it("fits the widest cell when there are only a few", () => {
    expect(fitWidth(60, [90, 140, 120], 80, 800)).toBe(140);
  });

  it("ignores one unusually long value among ten or more rows", () => {
    const cells = [100, 110, 105, 98, 120, 115, 102, 108, 111, 900];

    expect(fitWidth(60, cells, 80, 800)).toBe(120);
  });

  it("still fits a longest value that is within reach of the rest", () => {
    const cells = [100, 110, 105, 98, 120, 115, 102, 108, 111, 160];

    expect(fitWidth(60, cells, 80, 800)).toBe(160);
  });

  it("never cuts the header, and stays inside the limits", () => {
    expect(fitWidth(180, [90, 100], 80, 800)).toBe(180);
    expect(fitWidth(20, [30], 80, 800)).toBe(80);
    expect(fitWidth(60, [2000, 2100], 80, 800)).toBe(800);
  });

  it("falls back to the header for an empty column", () => {
    expect(fitWidth(132, [], 80, 800)).toBe(132);
  });
});

describe("sample", () => {
  it("keeps a short list whole and spreads a long one evenly", () => {
    expect(sample([1, 2, 3], 5)).toEqual([1, 2, 3]);

    const picked = sample(
      Array.from({ length: 1000 }, (_, i) => i),
      4,
    );

    expect(picked).toEqual([0, 250, 500, 750]);
  });
});
