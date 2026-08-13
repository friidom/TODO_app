import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORK_TYPE,
  WORK_TYPES,
  WORK_TYPE_OPTIONS,
  toWorkType,
  workTypeOf,
} from "./workTypes";

describe("work types", () => {
  it("offers exactly the four values the CHECK constraint allows", () => {
    // These strings are the constraint in 20260812090000_todos_work_type.sql.
    // If this fails, one side was changed without the other and a write will be
    // rejected by the database rather than by the UI.
    expect([...WORK_TYPE_OPTIONS].sort()).toEqual([
      "Bug",
      "Feature",
      "Story",
      "Task",
    ]);

    expect(Object.keys(WORK_TYPES).sort()).toEqual([...WORK_TYPE_OPTIONS].sort());
  });

  it("defaults to the value the column defaults to", () => {
    expect(DEFAULT_WORK_TYPE).toBe("Task");
  });

  it("narrows a stored value", () => {
    expect(toWorkType("Bug")).toBe("Bug");
  });

  // `type` is text with a CHECK, so the generated type is a plain string and
  // the compiler cannot narrow it. A row written before the migration, or by
  // anything that bypassed the constraint, still has to render.
  it("falls back rather than throwing on anything unexpected", () => {
    expect(toWorkType(null)).toBe(DEFAULT_WORK_TYPE);
    expect(toWorkType(undefined)).toBe(DEFAULT_WORK_TYPE);
    expect(toWorkType("")).toBe(DEFAULT_WORK_TYPE);
    expect(toWorkType("Epic")).toBe(DEFAULT_WORK_TYPE);
    expect(toWorkType("bug")).toBe(DEFAULT_WORK_TYPE);
  });

  it("always resolves an icon and a chip class", () => {
    for (const value of [...WORK_TYPE_OPTIONS, "Epic", null]) {
      const meta = workTypeOf(value);

      expect(meta.icon).toBeTruthy();
      expect(meta.chip).toMatch(/text-/);
    }
  });
});
