import { describe, expect, it } from "vitest";

import { relativeTime } from "./relativeTime";

/** A pinned "now". Every expectation below is relative to this instant. */
const NOW = Date.parse("2026-08-14T12:00:00.000Z");

/** `ms` before NOW, as the ISO string a row would carry. */
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("says nothing when there is nothing to say", () => {
    // A board with no work items has no last activity, and the chip that reads
    // this hides rather than rendering an empty one.
    expect(relativeTime(null, NOW)).toBeNull();
  });

  it("refuses a string that is not a time", () => {
    // Rendering "NaNm ago" is worse than rendering nothing.
    expect(relativeTime("not a date", NOW)).toBeNull();
  });

  it("collapses the first minute to 'just now'", () => {
    expect(relativeTime(ago(0), NOW)).toBe("just now");
    expect(relativeTime(ago(MINUTE - 1), NOW)).toBe("just now");
  });

  it("reads a future timestamp as 'just now' rather than a negative", () => {
    // Server and browser clocks disagree by seconds. "just now" is the truthful
    // reading of a few seconds in the future; "-1m ago" is not.
    expect(relativeTime(new Date(NOW + 30_000).toISOString(), NOW)).toBe(
      "just now",
    );
  });

  it("counts whole minutes, then whole hours, then whole days", () => {
    expect(relativeTime(ago(2 * MINUTE), NOW)).toBe("2m ago");
    expect(relativeTime(ago(59 * MINUTE), NOW)).toBe("59m ago");
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(relativeTime(ago(23 * HOUR), NOW)).toBe("23h ago");
    expect(relativeTime(ago(5 * DAY), NOW)).toBe("5d ago");
  });

  it("switches unit exactly at the boundary, never one tick early", () => {
    // The off-by-one that makes a clock read "60m ago" instead of "1h ago".
    expect(relativeTime(ago(HOUR - 1), NOW)).toBe("59m ago");
    expect(relativeTime(ago(HOUR), NOW)).toBe("1h ago");
    expect(relativeTime(ago(DAY - 1), NOW)).toBe("23h ago");
    expect(relativeTime(ago(DAY), NOW)).toBe("1d ago");
  });

  it("keeps counting in days rather than inventing weeks", () => {
    // This labels board activity: past a few days the exact figure stops
    // mattering, while a wrong unit still reads as a bug.
    expect(relativeTime(ago(90 * DAY), NOW)).toBe("90d ago");
  });
});
