import { describe, expect, it } from "vitest";

import { sprintEnd } from "./duration";

describe("sprintEnd", () => {
  it("counts the start day, so N weeks covers exactly 7N days", () => {
    expect(sprintEnd("2026-10-05", 1)).toBe("2026-10-11");
    expect(sprintEnd("2026-10-05", 2)).toBe("2026-10-18");
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(sprintEnd("2026-12-28", 1)).toBe("2027-01-03");
    expect(sprintEnd("2028-02-22", 2)).toBe("2028-03-06");
  });
});
