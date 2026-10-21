import { describe, expect, it } from "vitest";

import {
  TIMELINE_WINDOW,
  bandAnchor,
  bandLabel,
  dayFraction,
  dayIndex,
  headerBands,
  isCurrentAnchor,
  placeItem,
  placeItems,
  startOfQuarter,
  stepAnchor,
  timelineTicks,
  windowDays,
  windowEnd,
  windowLabel,
  type DaySpan,
  type HeaderBand,
} from "./timeline";

function item(start: string, end: string): DaySpan {
  return { start, end };
}

const days = (band: HeaderBand) => band.to - band.from;

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

  it("opens the week scale a week before the anchor's Monday, one day per column", () => {
    const ticks = timelineTicks("weeks", "2026-08-19");

    expect(ticks[0]).toBe("2026-08-10");
    expect(ticks[1]).toBe("2026-08-11");
    expect(ticks.at(-1)).toBe("2026-09-20");
  });

  it("starts the month scale on the Monday on or before the 1st", () => {
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

    expect(ticks[0]).toBe("2026-12-21");
    expect(ticks[7]).toBe("2026-12-28");
    expect(ticks[14]).toBe("2027-01-04");
  });
});

describe("windowEnd and windowDays", () => {
  it("is the day after the last column, whatever a column covers", () => {
    const weeks = timelineTicks("weeks", "2026-08-24");
    const months = timelineTicks("months", "2026-08-17");

    expect(windowEnd(weeks, "weeks")).toBe("2026-09-28");
    expect(windowEnd(months, "months")).toBe("2027-01-25");
  });

  it("counts the days the window covers", () => {
    expect(windowDays(timelineTicks("weeks", "2026-08-24"), "weeks")).toBe(42);
    expect(windowDays(timelineTicks("months", "2026-08-24"), "months")).toBe(
      182,
    );
  });
});

describe("dayIndex", () => {
  const months = timelineTicks("months", "2026-08-17");

  it("counts days from the first column, whatever a column covers", () => {
    expect(dayIndex("2026-07-27", months, "months")).toBe(0);
    expect(dayIndex("2026-08-05", months, "months")).toBe(9);
  });

  it("returns null outside the window rather than clamping", () => {
    expect(dayIndex("2026-07-26", months, "months")).toBeNull();
    expect(dayIndex(windowEnd(months, "months"), months, "months")).toBeNull();
  });
});

describe("placeItem", () => {
  const ticks = timelineTicks("weeks", "2026-08-24");

  it("spans the days a range covers, inclusive of both ends", () => {
    expect(placeItem(item("2026-08-18", "2026-08-20"), ticks, "weeks")).toEqual(
      { from: 1, to: 4, total: 42, openStart: false, openEnd: false },
    );
  });

  it("gives a single day exactly one day", () => {
    expect(
      placeItem(item("2026-08-19", "2026-08-19"), ticks, "weeks"),
    ).toMatchObject({ from: 2, to: 3 });
  });

  it("clips a range that began before the window and says it is open", () => {
    expect(placeItem(item("2026-07-01", "2026-08-19"), ticks, "weeks")).toEqual(
      { from: 0, to: 3, total: 42, openStart: true, openEnd: false },
    );
  });

  it("clips a range that runs past the window and says it is open", () => {
    expect(placeItem(item("2026-09-26", "2026-12-01"), ticks, "weeks")).toEqual(
      { from: 40, to: 42, total: 42, openStart: false, openEnd: true },
    );
  });

  it("fills the window for a range that swallows it whole", () => {
    expect(placeItem(item("2026-01-01", "2027-01-01"), ticks, "weeks")).toEqual(
      { from: 0, to: 42, total: 42, openStart: true, openEnd: true },
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
    ).toMatchObject({ from: 0, to: 1, openStart: true });
    expect(
      placeItem(item("2026-09-27", "2026-12-31"), ticks, "weeks"),
    ).toMatchObject({ from: 41, to: 42, openEnd: true });
  });

  it("ends a range on its own day inside a week-wide column, not on the Sunday", () => {
    // Oct 5 – Oct 21 (a Wednesday) on a window starting Mon Sep 28
    const months = timelineTicks("months", "2026-10-20");

    expect(
      placeItem(item("2026-10-05", "2026-10-21"), months, "months"),
    ).toEqual({
      from: 7,
      to: 24,
      total: 182,
      openStart: false,
      openEnd: false,
    });
  });
});

describe("placeItems", () => {
  it("drops the rows that are not in the window and keeps the rest in order", () => {
    const ticks = timelineTicks("weeks", "2026-08-24");

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
    expect(rows.map((row) => row.place.from)).toEqual([1, 8]);
  });
});

describe("headerBands", () => {
  it("names months above days at the week scale, one band per day", () => {
    const ticks = timelineTicks("weeks", "2026-08-24");
    const { major, minor } = headerBands(ticks, "weeks");

    expect(major.map((band) => band.key)).toEqual(["2026-08", "2026-09"]);
    expect(major[1].from).toBe(15);
    expect(minor).toHaveLength(ticks.length);
    expect(
      minor.every(
        (band, index) =>
          band.kind === "day" && band.from === index && days(band) === 1,
      ),
    ).toBe(true);
  });

  it("starts a month on its 1st even when that falls mid-week", () => {
    // window opens Mon Sep 28; Oct 1 is a Thursday
    const { major, minor } = headerBands(
      timelineTicks("months", "2026-10-20"),
      "months",
    );

    expect(major.map((band) => [band.key, band.from, band.to])).toEqual([
      ["2026-09", 0, 3],
      ["2026-10", 3, 34],
      ["2026-11", 34, 64],
      ["2026-12", 64, 95],
      ["2027-01", 95, 126],
      ["2027-02", 126, 154],
      ["2027-03", 154, 182],
    ]);
    expect(minor[1]).toMatchObject({ key: "2026-10-05", from: 7, to: 14 });
  });

  it("names quarters above calendar months at the quarter scale", () => {
    const ticks = timelineTicks("quarters", "2026-11-20");
    const { major, minor } = headerBands(ticks, "quarters");

    expect(major[0]).toMatchObject({ key: "2026-Q3", from: 0, to: 3 });
    expect(major[1]).toMatchObject({
      key: "2026-Q4",
      kind: "quarter",
      from: 3,
    });
    expect(minor.map((band) => band.key).slice(0, 4)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });

  it("covers every day of the window exactly once, in order", () => {
    for (const scale of ["weeks", "months", "quarters"] as const) {
      const ticks = timelineTicks(scale, "2026-08-17");
      const total = windowDays(ticks, scale);
      const { major, minor } = headerBands(ticks, scale);

      for (const row of [major, minor]) {
        expect(row[0].from).toBe(0);
        expect(row.at(-1)!.to).toBe(total);
        expect(
          row.every((band, i) => i === 0 || band.from === row[i - 1].to),
        ).toBe(true);
      }
    }
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

describe("the quarter scale", () => {
  it("starts on the Monday on or before the quarter's first day", () => {
    expect(startOfQuarter("2026-11-20")).toBe("2026-10-01");
    expect(startOfQuarter("2026-03-31")).toBe("2026-01-01");

    const ticks = timelineTicks("quarters", "2026-11-20");

    expect(ticks).toHaveLength(TIMELINE_WINDOW.quarters.ticks);
    expect(ticks[0]).toBe("2026-09-28");
    expect(ticks[1]).toBe("2026-10-05");
  });

  it("pages three months at a time and knows its own quarter", () => {
    expect(stepAnchor("quarters", "2026-11-20", 1)).toBe("2027-02-20");
    expect(stepAnchor("quarters", "2026-11-20", -1)).toBe("2026-08-20");

    expect(isCurrentAnchor("quarters", "2026-12-31", "2026-10-01")).toBe(true);
    expect(isCurrentAnchor("quarters", "2027-01-01", "2026-12-31")).toBe(false);
  });
});

describe("bandLabel", () => {
  it("shortens a narrow band instead of truncating it", () => {
    const band = { key: "2026-09", kind: "month" } as const;

    expect(bandLabel(band, "en")).toBe("September 2026");
    expect(bandLabel(band, "en", { short: true })).toBe("Sep");
  });

  it("names a quarter by its months", () => {
    expect(bandLabel({ key: "2026-Q4", kind: "quarter" }, "en")).toBe(
      "October – December 2026",
    );
  });
});

describe("windowLabel", () => {
  it("names the start year too when the window crosses one", () => {
    expect(
      windowLabel(timelineTicks("months", "2026-10-20"), "months", "en"),
    ).toBe("Sep 28, 2026 – Mar 28, 2027");
  });

  it("names it once when the window sits inside a year", () => {
    expect(
      windowLabel(timelineTicks("weeks", "2026-10-21"), "weeks", "en"),
    ).toBe("Oct 12 – Nov 22, 2026");
  });
});

describe("dayFraction", () => {
  it("puts a day in the middle of its own column at the week scale", () => {
    const ticks = timelineTicks("weeks", "2026-10-26");

    expect(dayFraction("2026-10-19", ticks, "weeks")).toBeCloseTo(0.5 / 42);
    expect(dayFraction("2026-10-20", ticks, "weeks")).toBeCloseTo(1.5 / 42);
  });

  it("places a day by days, not by its week's Monday, on a week-wide column", () => {
    const ticks = timelineTicks("months", "2026-10-20");
    const monday = dayFraction("2026-10-19", ticks, "months")!;
    const tuesday = dayFraction("2026-10-20", ticks, "months")!;

    expect(tuesday - monday).toBeCloseTo(1 / (26 * 7));
  });

  it("is null outside the window rather than pinned to an edge", () => {
    const ticks = timelineTicks("weeks", "2026-10-26");

    expect(dayFraction("2026-10-18", ticks, "weeks")).toBeNull();
    expect(dayFraction(windowEnd(ticks, "weeks"), ticks, "weeks")).toBeNull();
  });
});
