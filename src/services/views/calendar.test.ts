import { describe, expect, it } from "vitest";

import {
  DAY_ITEM_LIMIT,
  addDays,
  addMonths,
  groupByDueDay,
  isSameMonth,
  matrixFor,
  monthMatrix,
  offscreenCount,
  startOfMonth,
  startOfWeek,
  undatedTodos,
  weekMatrix,
} from "./calendar";
import type { Todo } from "@/types/data";

let seq = 0;

function todo(over: Partial<Todo> = {}): Todo {
  seq += 1;

  return {
    id: `t-${seq}`,
    board_id: "b-1",
    column_id: "c-1",
    board_key: seq,
    title: `Item ${seq}`,
    type: "Task",
    priority: null,
    due_date: null,
    assignee_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: null,
    ...over,
  } as Todo;
}

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("knows February in a leap year and out of one", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("does not drift across a DST boundary", () => {
    // The whole reason the arithmetic is UTC. In a zone that springs forward on
    // 2026-03-29, a local-time +24h lands at 01:00 on the 30th — still the
    // 30th — but the autumn fallback lands at 23:00 on the SAME day, and a
    // local getDate() would repeat it.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });
});

describe("addMonths", () => {
  it("clamps into the target month rather than rolling forward", () => {
    // The bug this exists to prevent: Date rolls 31 Jan + 1 month to 3 March,
    // so pressing "next" from a 31-day month would skip February entirely.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("pages a year without losing the day", () => {
    expect(addMonths("2026-08-16", 1)).toBe("2026-09-16");
    expect(addMonths("2026-12-16", 1)).toBe("2027-01-16");
    expect(addMonths("2026-01-16", -1)).toBe("2025-12-16");
  });
});

describe("startOfWeek", () => {
  it("goes back to Monday", () => {
    // 2026-08-16 is a Sunday; its week began Monday the 10th.
    expect(startOfWeek("2026-08-16")).toBe("2026-08-10");
    expect(startOfWeek("2026-08-10")).toBe("2026-08-10");
    expect(startOfWeek("2026-08-11")).toBe("2026-08-10");
  });

  it("never moves a Monday", () => {
    for (const monday of ["2026-01-05", "2026-06-01", "2026-12-28"]) {
      expect(startOfWeek(monday)).toBe(monday);
    }
  });
});

describe("startOfMonth", () => {
  it("keeps the month and zeroes the day", () => {
    expect(startOfMonth("2026-08-16")).toBe("2026-08-01");
    expect(startOfMonth("2026-01-01")).toBe("2026-01-01");
  });
});

describe("monthMatrix", () => {
  it("is always 42 days, so the grid never changes height", () => {
    for (const anchor of ["2026-02-15", "2026-08-16", "2028-02-10"]) {
      expect(monthMatrix(anchor)).toHaveLength(42);
    }
  });

  it("starts on a Monday and runs consecutively", () => {
    const days = monthMatrix("2026-08-16");

    expect(startOfWeek(days[0])).toBe(days[0]);

    for (let i = 1; i < days.length; i += 1) {
      expect(days[i]).toBe(addDays(days[i - 1], 1));
    }
  });

  it("brackets the month with its neighbours", () => {
    // August 2026 begins on a Saturday, so the grid opens on 27 July.
    const days = monthMatrix("2026-08-16");

    expect(days[0]).toBe("2026-07-27");
    expect(days).toContain("2026-08-01");
    expect(days).toContain("2026-08-31");
    expect(days[41]).toBe("2026-09-06");
  });

  it("gives the same grid for every day of one month", () => {
    expect(monthMatrix("2026-08-01")).toEqual(monthMatrix("2026-08-31"));
  });
});

describe("weekMatrix", () => {
  it("is seven consecutive days from Monday", () => {
    const days = weekMatrix("2026-08-16");

    expect(days).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });
});

describe("matrixFor", () => {
  it("dispatches without the caller choosing", () => {
    expect(matrixFor("month", "2026-08-16")).toEqual(monthMatrix("2026-08-16"));
    expect(matrixFor("week", "2026-08-16")).toEqual(weekMatrix("2026-08-16"));
  });
});

describe("isSameMonth", () => {
  it("dims only the padding days", () => {
    expect(isSameMonth("2026-08-01", "2026-08-16")).toBe(true);
    expect(isSameMonth("2026-07-31", "2026-08-16")).toBe(false);
    // Same month number, different year — not the same month.
    expect(isSameMonth("2025-08-16", "2026-08-16")).toBe(false);
  });
});

describe("groupByDueDay", () => {
  it("keys by the calendar day, never by a converted instant", () => {
    // Midnight UTC is the convention `fromCalendarDay` writes. Read back with
    // a local getDate() this is the 13th for anyone west of Greenwich, which
    // is the conversion the module refuses to do.
    const item = todo({ due_date: "2026-08-14T00:00:00+00:00" });

    expect([...groupByDueDay([item]).keys()]).toEqual(["2026-08-14"]);
  });

  it("accepts a bare date too, should the column ever narrow", () => {
    const item = todo({ due_date: "2026-08-14" });

    expect(groupByDueDay([item]).get("2026-08-14")).toEqual([item]);
  });

  it("keeps several items on one day in pipeline order", () => {
    const a = todo({ due_date: "2026-08-14T00:00:00Z" });
    const b = todo({ due_date: "2026-08-14T00:00:00Z" });

    expect(groupByDueDay([a, b]).get("2026-08-14")).toEqual([a, b]);
  });

  it("leaves undated items out of the map entirely", () => {
    const map = groupByDueDay([todo(), todo({ due_date: "2026-08-14" })]);

    expect(map.size).toBe(1);
  });
});

describe("undatedTodos", () => {
  it("is exactly what the map drops, so nothing is hidden", () => {
    const dated = todo({ due_date: "2026-08-14" });
    const bare = todo();

    expect(undatedTodos([dated, bare])).toEqual([bare]);
  });
});

describe("offscreenCount", () => {
  const days = monthMatrix("2026-08-16");

  it("counts items dated outside the drawn range", () => {
    const items = [
      todo({ due_date: "2026-08-14" }),
      todo({ due_date: "2026-12-01" }),
      todo({ due_date: "2025-01-01" }),
    ];

    expect(offscreenCount(items, days, true)).toBe(2);
  });

  it("counts undated items only when the strip is closed", () => {
    const items = [todo(), todo()];

    expect(offscreenCount(items, days, true)).toBe(0);
    expect(offscreenCount(items, days, false)).toBe(2);
  });

  it("is zero when everything is on screen", () => {
    expect(offscreenCount([todo({ due_date: "2026-08-20" })], days, true)).toBe(
      0,
    );
  });
});

describe("DAY_ITEM_LIMIT", () => {
  it("gives a week cell more room than a month cell", () => {
    // The overflow rule is one sentence for both layouts; only the limit
    // varies, with the height the layout gives a cell.
    expect(DAY_ITEM_LIMIT.week).toBeGreaterThan(DAY_ITEM_LIMIT.month);
  });

  it("bounds the month and does NOT bound the week, so the rule terminates", () => {
    // The month cell escalates to the week. The week has nowhere to escalate
    // to, so it lists everything and scrolls — a finite limit here would leave
    // "+N more" re-opening the layout it is already in, which is a dead
    // control on precisely the busiest day.
    expect(Number.isFinite(DAY_ITEM_LIMIT.month)).toBe(true);
    expect(Number.isFinite(DAY_ITEM_LIMIT.week)).toBe(false);
  });
});
