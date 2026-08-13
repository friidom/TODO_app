import { describe, expect, it } from "vitest";

import {
  dueStatus,
  formatDue,
  fromCalendarDay,
  toCalendarDay,
  todayISO,
} from "./dueDate";

// The shape the column actually produces. due_date is timestamptz, so every
// value arrives as a full ISO instant even though the product only means a day.
const STORED = "2026-08-13T00:00:00+00:00";

describe("toCalendarDay", () => {
  it("reduces a stored timestamptz to its day", () => {
    expect(toCalendarDay(STORED)).toBe("2026-08-13");
  });

  it("passes a bare date through unchanged", () => {
    expect(toCalendarDay("2026-08-13")).toBe("2026-08-13");
  });
});

describe("fromCalendarDay", () => {
  it("round-trips through toCalendarDay", () => {
    expect(toCalendarDay(fromCalendarDay("2026-08-13"))).toBe("2026-08-13");
  });

  it("pins the instant to UTC rather than leaving the zone to the server", () => {
    expect(fromCalendarDay("2026-08-13")).toBe("2026-08-13T00:00:00.000Z");
  });
});

describe("todayISO", () => {
  it("pads month and day to two digits", () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("reads local calendar components, not UTC ones", () => {
    // 23:30 local on the 20th is the 20th, whatever UTC thinks. toISOString()
    // here would return the 21st for anywhere east of Greenwich.
    expect(todayISO(new Date(2026, 7, 20, 23, 30))).toBe("2026-08-20");
  });
});

describe("dueStatus", () => {
  it("classifies a stored timestamptz against the given day", () => {
    expect(dueStatus(STORED, "2026-08-14")).toBe("overdue");
    expect(dueStatus(STORED, "2026-08-13")).toBe("today");
    expect(dueStatus(STORED, "2026-08-12")).toBe("upcoming");
  });

  it("compares across month and year boundaries", () => {
    expect(dueStatus("2026-07-31T00:00:00+00:00", "2026-08-01")).toBe(
      "overdue",
    );
    expect(dueStatus("2027-01-01T00:00:00+00:00", "2026-12-31")).toBe(
      "upcoming",
    );
  });

  // The regression this module exists to prevent. Comparing the raw stored
  // string against "2026-08-13" puts "2026-08-13T00:00:00+00:00" after it, so a
  // card due today read as upcoming and never went red.
  it("does not let the time part push today into the future", () => {
    expect(dueStatus(STORED, "2026-08-13")).toBe("today");
  });
});

describe("formatDue", () => {
  it("never shows a time, a zone or an ISO string", () => {
    const formatted = formatDue(STORED, "2026-08-01", "en-US");

    expect(formatted).not.toContain("T00:00");
    expect(formatted).not.toContain("+00:00");
    expect(formatted).toBe("Aug 13");
  });

  it("follows the locale's day/month order", () => {
    expect(formatDue(STORED, "2026-08-01", "en-GB")).toBe("13 Aug");
  });

  it("adds the year only when it differs from today's", () => {
    expect(formatDue("2027-08-13T00:00:00+00:00", "2026-08-01", "en-US")).toBe(
      "Aug 13, 2027",
    );
    expect(formatDue(STORED, "2026-08-01", "en-US")).not.toContain("2026");
  });

  // Formatting in UTC is what stops a date stored as midnight UTC rendering as
  // the previous day for a viewer west of Greenwich.
  it("shows the day that was stored, not the viewer's local day", () => {
    expect(formatDue(STORED, "2026-08-01", "en-US")).toContain("13");
  });
});
