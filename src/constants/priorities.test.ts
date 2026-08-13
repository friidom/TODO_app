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
    // These strings are the constraint in 20260806092902_todos_task_fields.sql:
    //   check (priority in ('lowest', 'low', 'medium', 'high', 'highest'))
    // If this fails, one side was changed without the other and a write will be
    // rejected by the database rather than by the UI.
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

  // Unlike work type, there is no default to fall back to: the column is
  // nullable and "no priority" is a real state that must render differently
  // from any of the five.
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
    // Alphabetically "high" < "highest" and "low" < "lowest", which is backwards
    // in both pairs. This is the whole reason the rank is a lookup.
    expect(priorityRank("highest")).toBeLessThan(priorityRank("high"));
    expect(priorityRank("low")).toBeLessThan(priorityRank("lowest"));
    expect(priorityRank("medium")).toBeLessThan(priorityRank("low"));
  });

  it("ranks an unset priority last rather than as medium", () => {
    // A card nobody has prioritised is not a card of middling importance.
    expect(priorityRank(null)).toBeGreaterThan(priorityRank("lowest"));
    expect(priorityRank("nonsense")).toBe(priorityRank(null));
  });

  it("resolves an icon, a label and a chip class for every option", () => {
    for (const value of PRIORITY_OPTIONS) {
      const meta = priorityOf(value);

      expect(meta).not.toBeNull();
      expect(meta?.icon).toBeTruthy();
      expect(meta?.label).toBeTruthy();
      // Whole literal strings, or Tailwind emits no CSS for them.
      expect(meta?.chip).toMatch(/text-/);
      expect(meta?.tone).toMatch(/text-/);
    }
  });
});
