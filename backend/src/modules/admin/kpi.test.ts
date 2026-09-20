import { describe, expect, it } from "vitest";

import { performanceOf, targetFor } from "./kpi.js";
import { periodRange } from "./periods.js";

const NOW = new Date("2026-09-20T15:30:00.000Z");

const rangeFor = (period: Parameters<typeof periodRange>[0]) => periodRange(period, NOW, "UTC");

describe("targetFor", () => {
  it("uses the daily figure for today, and only for today", () => {
    expect(targetFor("1d", rangeFor("1d"), 8, 40)).toBe(8);
  });

  it("uses the weekly figure unscaled for a seven-day window", () => {
    expect(targetFor("7d", rangeFor("7d"), 8, 40)).toBe(40);
  });

  it("scales the weekly figure by the elapsed window for anything longer", () => {
    expect(targetFor("30d", rangeFor("30d"), 8, 40)).toBeCloseTo((40 * 30) / 7, 1);
  });

  // D-16: a to-date period's target grows with it, so the second day of a
  // quarter is not measured against a whole quarter's work.
  it("grows a calendar period's target as the period elapses", () => {
    const early = targetFor("quarter", rangeFor("quarter"), 8, 40);
    const later = targetFor(
      "quarter",
      periodRange("quarter", new Date("2026-09-28T15:30:00.000Z"), "UTC"),
      8,
      40,
    );

    expect(early).not.toBeNull();
    expect(later!).toBeGreaterThan(early!);
  });

  // D-8 and D-12: null is a real state. A user nobody has classified has no
  // target — never a zero, which would be a claim about them.
  it("is null when there is no target, at every period", () => {
    expect(targetFor("1d", rangeFor("1d"), null, null)).toBeNull();
    expect(targetFor("7d", rangeFor("7d"), null, null)).toBeNull();
    expect(targetFor("30d", rangeFor("30d"), null, null)).toBeNull();
    expect(targetFor("3m", rangeFor("3m"), null, null)).toBeNull();
    expect(targetFor("quarter", rangeFor("quarter"), null, null)).toBeNull();
    expect(targetFor("year", rangeFor("year"), null, null)).toBeNull();
  });

  it("is null for today when only a weekly figure is configured", () => {
    expect(targetFor("1d", rangeFor("1d"), null, 40)).toBeNull();
  });

  it("keeps a configured zero as zero rather than treating it as absent", () => {
    expect(targetFor("1d", rangeFor("1d"), 0, 40)).toBe(0);
    expect(targetFor("7d", rangeFor("7d"), 8, 0)).toBe(0);
  });
});

describe("performanceOf", () => {
  it("is the two inputs divided, as a percentage", () => {
    expect(performanceOf(20, 40)).toBe(50);
    expect(performanceOf(40, 40)).toBe(100);
    expect(performanceOf(60, 40)).toBe(150);
  });

  it("rounds to one decimal rather than implying precision it does not have", () => {
    expect(performanceOf(13, 40)).toBe(32.5);
    expect(performanceOf(1, 3)).toBe(33.3);
  });

  // The rule this milestone repeats everywhere: "—", never "0%".
  it("is null with no target, even when work was completed", () => {
    expect(performanceOf(0, null)).toBeNull();
    expect(performanceOf(25, null)).toBeNull();
  });

  // A level measured at zero points divided into is Infinity, which renders
  // as a number and means nothing.
  it("is null against a zero target rather than infinite", () => {
    expect(performanceOf(5, 0)).toBeNull();
    expect(performanceOf(0, 0)).toBeNull();
  });

  it("is a real zero when there is a target and nothing was completed", () => {
    expect(performanceOf(0, 40)).toBe(0);
  });
});
