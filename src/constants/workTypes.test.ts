import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORK_TYPE,
  WORK_TYPES,
  WORK_TYPE_OPTIONS,
  toWorkType,
  workTypeOf,
} from "./workTypes";

describe("work types", () => {
  it("offers exactly the five values the CHECK constraint allows", () => {
    // must match the todos_work_type CHECK constraint, or a write gets rejected by the DB instead of the UI
    expect([...WORK_TYPE_OPTIONS].sort()).toEqual([
      "Bug",
      "Epic",
      "Feature",
      "Story",
      "Task",
    ]);

    expect(Object.keys(WORK_TYPES).sort()).toEqual(
      [...WORK_TYPE_OPTIONS].sort(),
    );
  });

  it("defaults to the value the column defaults to", () => {
    expect(DEFAULT_WORK_TYPE).toBe("Task");
  });

  it("narrows a stored value", () => {
    expect(toWorkType("Bug")).toBe("Bug");
  });

  it("narrows Epic like any other value", () => {
    expect(toWorkType("Epic")).toBe("Epic");
  });

  it("falls back rather than throwing on anything unexpected", () => {
    expect(toWorkType(null)).toBe(DEFAULT_WORK_TYPE);
    expect(toWorkType(undefined)).toBe(DEFAULT_WORK_TYPE);
    expect(toWorkType("")).toBe(DEFAULT_WORK_TYPE);
    expect(toWorkType("Chore")).toBe(DEFAULT_WORK_TYPE);
    expect(toWorkType("bug")).toBe(DEFAULT_WORK_TYPE);
  });

  it("always resolves an icon and a chip class", () => {
    for (const value of [...WORK_TYPE_OPTIONS, "Chore", null]) {
      const meta = workTypeOf(value);

      expect(meta.icon).toBeTruthy();
      expect(meta.chip).toMatch(/text-/);
    }
  });
});
