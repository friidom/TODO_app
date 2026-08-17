import { describe, expect, it } from "vitest";

import {
  TIMELINE_WINDOW,
  bandAnchor,
  isCurrentAnchor,
  monthBands,
  placeItem,
  placeItems,
  stepAnchor,
  tickIndexOf,
  timelineItems,
  timelineTicks,
  unscheduledCount,
  windowEnd,
  type TimelineItem,
} from "./timeline";
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
    start_date: null,
    due_date: null,
    assignee_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: null,
    ...over,
  } as Todo;
}

/** A stored instant, written the way `fromCalendarDay` writes one. */
function at(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function item(start: string, end: string, isPoint = false): TimelineItem {
  return { todo: todo(), start, end, isPoint };
}

describe("timelineItems", () => {
  it("makes a range from two dates", () => {
    const [row] = timelineItems([
      todo({ start_date: at("2026-08-10"), due_date: at("2026-08-14") }),
    ]);

    expect(row.start).toBe("2026-08-10");
    expect(row.end).toBe("2026-08-14");
    expect(row.isPoint).toBe(false);
  });

  it("makes a POINT from a due date alone", () => {
    // The plan states this one literally: "a task with only a due date is a
    // point, not a zero-width bar."
    const [row] = timelineItems([todo({ due_date: at("2026-08-14") })]);

    expect(row).toMatchObject({
      start: "2026-08-14",
      end: "2026-08-14",
      isPoint: true,
    });
  });

  it("makes a point from a start date alone, by the same rule", () => {
    const [row] = timelineItems([todo({ start_date: at("2026-08-03") })]);

    expect(row).toMatchObject({
      start: "2026-08-03",
      end: "2026-08-03",
      isPoint: true,
    });
  });

  it("treats one day with BOTH dates as a range, not a point", () => {
    // The distinction is how much is known, not how wide the result is. A task
    // that starts and ends on the 12th has a real, deliberate span of one day.
    const [row] = timelineItems([
      todo({ start_date: at("2026-08-12"), due_date: at("2026-08-12") }),
    ]);

    expect(row.isPoint).toBe(false);
  });

  it("leaves an undated item off the timeline entirely", () => {
    expect(
      timelineItems([todo(), todo({ due_date: at("2026-08-01") })]),
    ).toHaveLength(1);
  });

  it("orders by start, then end, then key — never by anything stored", () => {
    const rows = timelineItems([
      todo({
        board_key: 9,
        start_date: at("2026-08-10"),
        due_date: at("2026-08-20"),
      }),
      todo({
        board_key: 4,
        start_date: at("2026-08-01"),
        due_date: at("2026-08-05"),
      }),
      todo({
        board_key: 7,
        start_date: at("2026-08-10"),
        due_date: at("2026-08-12"),
      }),
      todo({
        board_key: 2,
        start_date: at("2026-08-10"),
        due_date: at("2026-08-12"),
      }),
    ]);

    expect(rows.map((row) => row.todo.board_key)).toEqual([4, 2, 7, 9]);
  });

  it("puts a card whose key is still in flight last, not first", () => {
    const rows = timelineItems([
      todo({
        board_key: null,
        start_date: at("2026-08-10"),
        due_date: at("2026-08-10"),
      }),
      todo({
        board_key: 3,
        start_date: at("2026-08-10"),
        due_date: at("2026-08-10"),
      }),
    ]);

    expect(rows.map((row) => row.todo.board_key)).toEqual([3, null]);
  });

  it("orders an inverted pair rather than drawing a negative bar", () => {
    // The CHECK constraint forbids this, so it can only reach the client from a
    // row written before the constraint existed. It still must not render as a
    // bar of negative width.
    const [row] = timelineItems([
      todo({ start_date: at("2026-09-01"), due_date: at("2026-08-01") }),
    ]);

    expect(row.start).toBe("2026-08-01");
    expect(row.end).toBe("2026-09-01");
  });

  it("reads the day out of the stored instant without converting it", () => {
    // Midnight UTC, sliced — never parsed into a local Date, which is what
    // would move a task due the 14th to the 13th west of Greenwich.
    const [row] = timelineItems([
      todo({ due_date: "2026-08-14T00:00:00+00:00" }),
    ]);

    expect(row.start).toBe("2026-08-14");
  });
});

describe("unscheduledCount", () => {
  it("counts exactly what the timeline drops", () => {
    const todos = [
      todo(),
      todo(),
      todo({ due_date: at("2026-08-01") }),
      todo({ start_date: at("2026-08-01") }),
    ];

    expect(unscheduledCount(todos)).toBe(2);
    expect(unscheduledCount(todos) + timelineItems(todos).length).toBe(
      todos.length,
    );
  });
});

describe("timelineTicks", () => {
  it("draws a fixed number of columns, so the axis never changes width", () => {
    for (const anchor of ["2026-01-01", "2026-02-15", "2026-08-31"]) {
      expect(timelineTicks("weeks", anchor)).toHaveLength(
        TIMELINE_WINDOW.weeks.ticks,
      );
      expect(timelineTicks("months", anchor)).toHaveLength(
        TIMELINE_WINDOW.months.ticks,
      );
    }
  });

  it("starts the week scale on the anchor's Monday, one day per column", () => {
    // 2026-08-17 is a Monday; the 19th is the Wednesday of the same week.
    const ticks = timelineTicks("weeks", "2026-08-19");

    expect(ticks[0]).toBe("2026-08-17");
    expect(ticks[1]).toBe("2026-08-18");
    expect(ticks.at(-1)).toBe("2026-09-27");
  });

  it("starts the month scale on the Monday on or before the 1st", () => {
    // 2026-08-01 is a Saturday, so its week began Monday 2026-07-27.
    const ticks = timelineTicks("months", "2026-08-19");

    expect(ticks[0]).toBe("2026-07-27");
    expect(ticks[1]).toBe("2026-08-03");
  });

  it("gives every day of one month the same month-scale window", () => {
    expect(timelineTicks("months", "2026-08-01")).toEqual(
      timelineTicks("months", "2026-08-31"),
    );
  });

  it("crosses a year boundary without drifting", () => {
    const ticks = timelineTicks("weeks", "2026-12-28");

    expect(ticks[0]).toBe("2026-12-28");
    expect(ticks[7]).toBe("2027-01-04");
  });
});

describe("windowEnd", () => {
  it("is the day after the last column, whatever a column covers", () => {
    const weeks = timelineTicks("weeks", "2026-08-17");
    const months = timelineTicks("months", "2026-08-17");

    expect(windowEnd(weeks, "weeks")).toBe("2026-09-28");
    expect(windowEnd(months, "months")).toBe(
      // 26 weeks from 2026-07-27, exclusive.
      "2027-01-25",
    );
  });
});

describe("tickIndexOf", () => {
  const weeks = timelineTicks("weeks", "2026-08-17");
  const months = timelineTicks("months", "2026-08-17");

  it("finds the day's own column at the week scale", () => {
    expect(tickIndexOf("2026-08-17", weeks, "weeks")).toBe(0);
    expect(tickIndexOf("2026-08-20", weeks, "weeks")).toBe(3);
  });

  it("finds the containing WEEK at the month scale", () => {
    // Every day of 2026-08-03..09 lands in the same column.
    expect(tickIndexOf("2026-08-03", months, "months")).toBe(1);
    expect(tickIndexOf("2026-08-09", months, "months")).toBe(1);
    expect(tickIndexOf("2026-08-10", months, "months")).toBe(2);
  });

  it("returns null outside the window rather than clamping", () => {
    expect(tickIndexOf("2026-08-16", weeks, "weeks")).toBeNull();
    expect(tickIndexOf("2026-09-28", weeks, "weeks")).toBeNull();
  });
});

describe("placeItem", () => {
  const ticks = timelineTicks("weeks", "2026-08-17"); // 2026-08-17 .. 09-27

  it("spans the columns a range covers, inclusive of both ends", () => {
    expect(placeItem(item("2026-08-18", "2026-08-20"), ticks, "weeks")).toEqual(
      {
        index: 1,
        span: 3,
        openStart: false,
        openEnd: false,
      },
    );
  });

  it("gives a point exactly one column", () => {
    expect(
      placeItem(item("2026-08-19", "2026-08-19", true), ticks, "weeks"),
    ).toMatchObject({ index: 2, span: 1 });
  });

  it("clips a range that began before the window and says it is open", () => {
    expect(placeItem(item("2026-07-01", "2026-08-19"), ticks, "weeks")).toEqual(
      {
        index: 0,
        span: 3,
        openStart: true,
        openEnd: false,
      },
    );
  });

  it("clips a range that runs past the window and says it is open", () => {
    expect(placeItem(item("2026-09-26", "2026-12-01"), ticks, "weeks")).toEqual(
      {
        index: 40,
        span: 2,
        openStart: false,
        openEnd: true,
      },
    );
  });

  it("fills the window for a range that swallows it whole", () => {
    expect(placeItem(item("2026-01-01", "2027-01-01"), ticks, "weeks")).toEqual(
      {
        index: 0,
        span: ticks.length,
        openStart: true,
        openEnd: true,
      },
    );
  });

  it("is null when the range misses the window entirely", () => {
    expect(
      placeItem(item("2026-06-01", "2026-06-30"), ticks, "weeks"),
    ).toBeNull();
    expect(
      placeItem(item("2026-10-01", "2026-10-30"), ticks, "weeks"),
    ).toBeNull();
  });

  it("keeps a range touching the very first and last day", () => {
    expect(
      placeItem(item("2026-06-01", "2026-08-17"), ticks, "weeks"),
    ).toMatchObject({
      index: 0,
      span: 1,
      openStart: true,
    });
    expect(
      placeItem(item("2026-09-27", "2026-12-31"), ticks, "weeks"),
    ).toMatchObject({
      index: 41,
      span: 1,
      openEnd: true,
    });
  });
});

describe("placeItems", () => {
  it("drops the rows that are not in the window and keeps the rest in order", () => {
    const ticks = timelineTicks("weeks", "2026-08-17");

    const rows = placeItems(
      [
        item("2026-08-18", "2026-08-19"),
        item("2026-01-01", "2026-01-05"),
        item("2026-08-25", "2026-08-26"),
      ],
      ticks,
      "weeks",
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.place.index)).toEqual([1, 8]);
  });
});

describe("monthBands", () => {
  it("groups consecutive columns by the month each begins in", () => {
    const bands = monthBands(timelineTicks("weeks", "2026-08-17"));

    expect(bands.map((band) => band.key)).toEqual(["2026-08", "2026-09"]);
    // 17 August through 31 August is fifteen days, then September takes the
    // rest of the forty-two.
    expect(bands[0]).toEqual({ key: "2026-08", index: 0, span: 15 });
    expect(bands[1]).toEqual({ key: "2026-09", index: 15, span: 27 });
  });

  it("covers every column exactly once", () => {
    for (const scale of ["weeks", "months"] as const) {
      const ticks = timelineTicks(scale, "2026-08-17");
      const bands = monthBands(ticks);

      expect(bands.reduce((total, band) => total + band.span, 0)).toBe(
        ticks.length,
      );
      expect(bands[0].index).toBe(0);
    }
  });

  it("files a straddling week under the month it starts in", () => {
    // The month scale's first column is 2026-07-27, a week that ends in August.
    const bands = monthBands(timelineTicks("months", "2026-08-17"));

    expect(bands[0]).toEqual({ key: "2026-07", index: 0, span: 1 });
  });

  it("hands back a day the month label can be built from", () => {
    expect(bandAnchor("2026-08")).toBe("2026-08-01");
  });
});

describe("stepAnchor", () => {
  it("pages a week at the week scale", () => {
    expect(stepAnchor("weeks", "2026-08-17", 1)).toBe("2026-08-24");
    expect(stepAnchor("weeks", "2026-08-17", -1)).toBe("2026-08-10");
  });

  it("pages a month at the month scale, clamping rather than rolling", () => {
    expect(stepAnchor("months", "2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("isCurrentAnchor", () => {
  it("is true anywhere in today's own week at the week scale", () => {
    expect(isCurrentAnchor("weeks", "2026-08-20", "2026-08-17")).toBe(true);
    expect(isCurrentAnchor("weeks", "2026-08-24", "2026-08-17")).toBe(false);
  });

  it("is true anywhere in today's own month at the month scale", () => {
    expect(isCurrentAnchor("months", "2026-08-31", "2026-08-01")).toBe(true);
    expect(isCurrentAnchor("months", "2026-09-01", "2026-08-31")).toBe(false);
  });
});
