import { describe, expect, it } from "vitest";

import {
  ADMIN_PERIODS,
  DEFAULT_PERIOD,
  bucketOf,
  heatmapRange,
  isAdminPeriod,
  periodRange,
  windowDays,
  type AdminPeriod,
} from "./periods.js";

// Mid-quarter and mid-month on purpose: a `now` on the 1st would make several
// of these windows coincide by accident and the tests would pass for the
// wrong reason.
const NOW = new Date("2026-09-20T15:30:00.000Z");

describe("the period list", () => {
  it("is the six M34 declares, and nothing else", () => {
    expect(ADMIN_PERIODS).toEqual(["1d", "7d", "30d", "3m", "quarter", "year"]);
  });

  it("opens on 7 days", () => {
    expect(DEFAULT_PERIOD).toBe("7d");
  });

  it("recognises its own values and rejects anything else", () => {
    for (const period of ADMIN_PERIODS) expect(isAdminPeriod(period)).toBe(true);

    expect(isAdminPeriod("90d")).toBe(false);
    expect(isAdminPeriod("month")).toBe(false);
    expect(isAdminPeriod(7)).toBe(false);
    expect(isAdminPeriod(undefined)).toBe(false);
  });

  it("gives every period a bucket, and never a daily bucket for a year", () => {
    expect(ADMIN_PERIODS.map(bucketOf)).toEqual(["hour", "day", "day", "week", "week", "month"]);
  });

  it("resolves every period to a window that ends now and starts before it", () => {
    for (const period of ADMIN_PERIODS) {
      const range = periodRange(period, NOW, "UTC");

      expect(range.to).toEqual(NOW);
      expect(range.from.getTime()).toBeLessThan(NOW.getTime());
      expect(range.bucket).toBe(bucketOf(period));
    }
  });
});

describe("3m and quarter are different windows", () => {
  // The distinction D-11 exists to protect. 3m is a rolling three months;
  // quarter is the calendar quarter to date. On 20 September they reach back
  // to 20 June and 1 July respectively.
  it("reaches back to different instants", () => {
    const rolling = periodRange("3m", NOW, "UTC");
    const calendar = periodRange("quarter", NOW, "UTC");

    expect(rolling.from.toISOString()).toBe("2026-06-20T15:30:00.000Z");
    expect(calendar.from.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(rolling.from.getTime()).not.toBe(calendar.from.getTime());
    expect(rolling.from.getTime()).toBeLessThan(calendar.from.getTime());
  });

  it("stays different on the last day of a quarter", () => {
    const end = new Date("2026-09-30T23:00:00.000Z");

    expect(periodRange("3m", end, "UTC").from.getTime()).not.toBe(
      periodRange("quarter", end, "UTC").from.getTime(),
    );
  });

  // The one day they come closest: 3m reaches back exactly one quarter, and
  // quarter has only just begun.
  it("stays different on the first day of a quarter", () => {
    const start = new Date("2026-07-01T09:00:00.000Z");
    const rolling = periodRange("3m", start, "UTC");
    const calendar = periodRange("quarter", start, "UTC");

    expect(rolling.from.toISOString()).toBe("2026-04-01T09:00:00.000Z");
    expect(calendar.from.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("calendar periods are to date, durations are rolling", () => {
  it("starts 1d at the beginning of today, not 24 hours ago", () => {
    expect(periodRange("1d", NOW, "UTC").from.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("starts 7d and 30d exactly that many days back, to the second", () => {
    expect(periodRange("7d", NOW, "UTC").from.toISOString()).toBe("2026-09-13T15:30:00.000Z");
    expect(periodRange("30d", NOW, "UTC").from.toISOString()).toBe("2026-08-21T15:30:00.000Z");
  });

  it("starts year at the first of January", () => {
    expect(periodRange("year", NOW, "UTC").from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("the zone decides where a day begins", () => {
  // The whole reason APP_TIMEZONE is configured once: "today" in Tashkent
  // started five hours before "today" in UTC.
  it("starts today at local midnight, not UTC midnight", () => {
    const tashkent = periodRange("1d", NOW, "Asia/Tashkent");

    expect(tashkent.from.toISOString()).toBe("2026-09-19T19:00:00.000Z");
  });

  it("puts a UTC-morning instant into the previous local day west of Greenwich", () => {
    const earlyMorning = new Date("2026-09-20T03:00:00.000Z");

    expect(periodRange("1d", earlyMorning, "America/New_York").from.toISOString()).toBe(
      "2026-09-19T04:00:00.000Z",
    );
  });

  it("survives a spring-forward boundary", () => {
    // 8 March 2026, the US DST change. Local midnight is still a real instant.
    const afterTheChange = new Date("2026-03-08T18:00:00.000Z");
    const range = periodRange("1d", afterTheChange, "America/New_York");

    expect(range.from.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("does not roll a three-month step forward off the end of a short month", () => {
    const endOfMay = new Date("2026-05-31T12:00:00.000Z");

    // Not 3 March: clamped to the last day February has.
    expect(periodRange("3m", endOfMay, "UTC").from.toISOString()).toBe("2026-02-28T12:00:00.000Z");
  });
});

describe("windowDays", () => {
  it("measures the elapsed window, which is what scales a weekly target", () => {
    expect(windowDays(periodRange("7d", NOW, "UTC"))).toBeCloseTo(7, 6);
    expect(windowDays(periodRange("30d", NOW, "UTC"))).toBeCloseTo(30, 6);
  });

  // A to-date period grows through the quarter, so the target it is compared
  // against has to grow with it (D-16).
  it("grows through a calendar period rather than jumping to its full length", () => {
    const early = windowDays(periodRange("quarter", new Date("2026-07-03T00:00:00.000Z"), "UTC"));
    const late = windowDays(periodRange("quarter", new Date("2026-09-28T00:00:00.000Z"), "UTC"));

    expect(early).toBeCloseTo(2, 6);
    expect(late).toBeGreaterThan(80);
  });
});

describe("the heatmap window", () => {
  it("ignores the selected period and covers 53 whole weeks", () => {
    const range = heatmapRange(NOW, "UTC");

    expect(windowDays(range)).toBeGreaterThan(52 * 7);
    expect(range.bucket).toBe("day");
  });

  it("starts on a Sunday, so the grid has no ragged first column", () => {
    for (const day of ["2026-09-20", "2026-09-21", "2026-09-26", "2026-01-01"]) {
      expect(heatmapRange(new Date(`${day}T12:00:00.000Z`), "UTC").from.getUTCDay()).toBe(0);
    }
  });
});

describe("every period is usable by the callers that consume it", () => {
  it.each(ADMIN_PERIODS)("%s produces a finite, positive window", (period: AdminPeriod) => {
    const days = windowDays(periodRange(period, NOW, "UTC"));

    expect(Number.isFinite(days)).toBe(true);
    expect(days).toBeGreaterThan(0);
  });
});
