import { describe, expect, it } from "vitest";

import { dayToMs, monthGrid, shiftMonth } from "./calendarGrid";

describe("monthGrid", () => {
  it("always returns six full weeks, so the popover never changes height", () => {
    for (let month = 0; month < 12; month++) {
      expect(monthGrid(2026, month)).toHaveLength(42);
    }
  });

  it("starts on the week containing the 1st", () => {
    // 1 Aug 2026 is a Saturday, so a Monday-first grid opens on 27 Jul.
    expect(monthGrid(2026, 7)[0]).toEqual({ day: "2026-07-27", inMonth: false });
  });

  it("respects a Sunday-first week", () => {
    expect(monthGrid(2026, 7, 0)[0]).toEqual({
      day: "2026-07-26",
      inMonth: false,
    });
  });

  it("flags only the target month's own days", () => {
    const august = monthGrid(2026, 7).filter((entry) => entry.inMonth);

    expect(august).toHaveLength(31);
    expect(august[0].day).toBe("2026-08-01");
    expect(august.at(-1)?.day).toBe("2026-08-31");
  });

  it("runs consecutively with no gaps or repeats", () => {
    const grid = monthGrid(2026, 1);

    expect(new Set(grid.map((entry) => entry.day)).size).toBe(42);

    for (let i = 1; i < grid.length; i++) {
      expect(dayToMs(grid[i].day) - dayToMs(grid[i - 1].day)).toBe(86_400_000);
    }
  });

  it("handles a leap February", () => {
    const february = monthGrid(2028, 1).filter((entry) => entry.inMonth);

    expect(february).toHaveLength(29);
    expect(february.at(-1)?.day).toBe("2028-02-29");
  });

  // Built on Date.UTC for this reason: local arithmetic across a DST boundary
  // can land on 23:00 the previous day and shift a whole row by one.
  it("is unaffected by daylight saving transitions", () => {
    const march = monthGrid(2026, 2).filter((entry) => entry.inMonth);

    expect(march).toHaveLength(31);
    expect(march[0].day).toBe("2026-03-01");
  });
});

describe("shiftMonth", () => {
  it("moves within a year", () => {
    expect(shiftMonth(2026, 5, 1)).toEqual({ year: 2026, month: 6 });
  });

  it("carries forward across December", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it("carries back across January", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});
