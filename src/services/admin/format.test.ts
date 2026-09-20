import { describe, expect, it } from "vitest";

import {
  LOCALE,
  NO_VALUE,
  actionLabel,
  barWidth,
  bucketLabel,
  dash,
  percent,
} from "./format";

describe("dash and percent", () => {
  it("renders a missing value as an em dash, never as zero", () => {
    expect(dash(null)).toBe(NO_VALUE);
    expect(dash(undefined)).toBe(NO_VALUE);
    expect(percent(null)).toBe(NO_VALUE);
  });

  it("keeps a real zero", () => {
    expect(dash(0)).toBe("0");
    expect(percent(0)).toBe("0%");
  });

  it("shows one decimal only when there is one", () => {
    expect(dash(8)).toBe("8");
    expect(dash(8.5)).toBe("8.5");
    expect(percent(32.5)).toBe("32.5%");
    expect(percent(100)).toBe("100%");
  });
});

describe("bucketLabel", () => {
  // Asserted against Intl at the module's own pinned locale rather than
  // against a literal: what is under test is the UTC reading, not the
  // spelling of the month.
  it("reads a midnight bucket as UTC, so a label cannot land on the previous day", () => {
    const expected = new Date(Date.UTC(2026, 8, 20)).toLocaleDateString(
      LOCALE,
      {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      },
    );

    expect(bucketLabel("2026-09-20T00:00:00", "day")).toBe(expected);
  });

  it("labels a month bucket by its month and year", () => {
    const expected = new Date(Date.UTC(2026, 0, 1)).toLocaleDateString(LOCALE, {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });

    expect(bucketLabel("2026-01-01T00:00:00", "month")).toBe(expected);
  });

  it("returns the raw key rather than Invalid Date when it cannot parse one", () => {
    expect(bucketLabel("not-a-date", "day")).toBe("not-a-date");
  });
});

describe("barWidth", () => {
  it("is a share of the column maximum", () => {
    expect(barWidth(5, 10)).toBe("50%");
    expect(barWidth(10, 10)).toBe("100%");
  });

  it("is nothing at all for zero", () => {
    expect(barWidth(0, 10)).toBe("0%");
  });

  it("never renders a real value as an invisible bar", () => {
    expect(barWidth(1, 1000)).toBe("2%");
  });

  it("does not divide by an empty column", () => {
    expect(barWidth(0, 0)).toBe("0%");
    expect(barWidth(5, 0)).toBe("0%");
  });
});

describe("actionLabel", () => {
  it("turns a stored enum into something a person reads", () => {
    expect(actionLabel("estimate_changed")).toBe("Estimate changed");
    expect(actionLabel("moved")).toBe("Moved");
    expect(actionLabel("task_added_to_epic")).toBe("Task added to epic");
  });

  it("reads an audit action, which namespaces with a dot rather than an underscore", () => {
    expect(actionLabel("kpi_target.updated")).toBe("KPI target updated");
    expect(actionLabel("user.seniority_changed")).toBe(
      "User seniority changed",
    );
  });

  it("leaves an unknown action legible rather than blank", () => {
    expect(actionLabel("")).toBe("");
    expect(actionLabel("something_new")).toBe("Something new");
  });
});
