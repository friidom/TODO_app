import { describe, expect, it } from "vitest";

import {
  PRIORITIES,
  PRIORITY_OPTIONS,
  priorityOf,
  priorityRank,
  toPriority,
} from "./priorities";

describe("priorities", () => {
  it("offers exactly the five values the CHECK constraint allows", () => {
    // must match the todos_task_fields CHECK constraint, or a write gets rejected by the DB instead of the UI
    expect([...PRIORITY_OPTIONS].sort()).toEqual([
      "high",
      "highest",
      "low",
      "lowest",
      "medium",
    ]);

    expect(Object.keys(PRIORITIES).sort()).toEqual(
      [...PRIORITY_OPTIONS].sort(),
    );
  });

  it("lists most urgent first, because that order is also the sort rank", () => {
    expect(PRIORITY_OPTIONS[0]).toBe("highest");
    expect(PRIORITY_OPTIONS[PRIORITY_OPTIONS.length - 1]).toBe("lowest");
  });

  it("narrows a stored value", () => {
    expect(toPriority("high")).toBe("high");
  });

  it("returns null for unset and for anything unrecognised", () => {
    expect(toPriority(null)).toBeNull();
    expect(toPriority(undefined)).toBeNull();
    expect(toPriority("")).toBeNull();
    expect(toPriority("urgent")).toBeNull();
    expect(toPriority("High")).toBeNull();

    expect(priorityOf(null)).toBeNull();
    expect(priorityOf("urgent")).toBeNull();
  });

  it("ranks by urgency, not alphabetically", () => {
    // alphabetically "high" < "highest" and "low" < "lowest" — backwards in both pairs
    expect(priorityRank("highest")).toBeLessThan(priorityRank("high"));
    expect(priorityRank("low")).toBeLessThan(priorityRank("lowest"));
    expect(priorityRank("medium")).toBeLessThan(priorityRank("low"));
  });

  it("ranks an unset priority last rather than as medium", () => {
    expect(priorityRank(null)).toBeGreaterThan(priorityRank("lowest"));
    expect(priorityRank("nonsense")).toBe(priorityRank(null));
  });

  it("resolves an icon, a label and a chip class for every option", () => {
    for (const value of PRIORITY_OPTIONS) {
      const meta = priorityOf(value);

      expect(meta).not.toBeNull();
      expect(meta?.icon).toBeTruthy();
      expect(meta?.label).toBeTruthy();
      expect(meta?.chip).toMatch(/text-/);
      expect(meta?.tone).toMatch(/text-/);
    }
  });
});
