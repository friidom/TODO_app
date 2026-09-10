import { describe, expect, it } from "vitest";

import { relativeTime } from "./relativeTime";

const NOW = Date.parse("2026-08-14T12:00:00.000Z");

const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("says nothing when there is nothing to say", () => {
    expect(relativeTime(null, NOW)).toBeNull();
  });

  it("refuses a string that is not a time", () => {
    expect(relativeTime("not a date", NOW)).toBeNull();
  });

  it("collapses the first minute to 'just now'", () => {
    expect(relativeTime(ago(0), NOW)).toBe("just now");
    expect(relativeTime(ago(MINUTE - 1), NOW)).toBe("just now");
  });

  it("reads a future timestamp as 'just now' rather than a negative", () => {
    // clock skew between server and browser shouldn't ever read as "-1m ago"
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
    expect(relativeTime(ago(HOUR - 1), NOW)).toBe("59m ago");
    expect(relativeTime(ago(HOUR), NOW)).toBe("1h ago");
    expect(relativeTime(ago(DAY - 1), NOW)).toBe("23h ago");
    expect(relativeTime(ago(DAY), NOW)).toBe("1d ago");
  });

  it("keeps counting in days rather than inventing weeks", () => {
    expect(relativeTime(ago(90 * DAY), NOW)).toBe("90d ago");
  });

  describe("short form", () => {
    it("drops the 'ago' and shortens 'just now'", () => {
      expect(relativeTime(ago(0), NOW, { short: true })).toBe("now");
      expect(relativeTime(ago(5 * MINUTE), NOW, { short: true })).toBe("5m");
      expect(relativeTime(ago(5 * HOUR), NOW, { short: true })).toBe("5h");
      expect(relativeTime(ago(3 * DAY), NOW, { short: true })).toBe("3d");
    });

    it("picks the same unit at the same boundary as the long form", () => {
      expect(relativeTime(ago(HOUR - 1), NOW, { short: true })).toBe("59m");
      expect(relativeTime(ago(HOUR), NOW, { short: true })).toBe("1h");
      expect(relativeTime(ago(DAY), NOW, { short: true })).toBe("1d");
    });

    it("leaves the long form alone when omitted or explicitly off", () => {
      expect(relativeTime(ago(5 * HOUR), NOW)).toBe("5h ago");
      expect(relativeTime(ago(5 * HOUR), NOW, {})).toBe("5h ago");
      expect(relativeTime(ago(5 * HOUR), NOW, { short: false })).toBe("5h ago");
    });

    it("still refuses what it refused before", () => {
      expect(relativeTime(null, NOW, { short: true })).toBeNull();
      expect(relativeTime("not a date", NOW, { short: true })).toBeNull();
    });
  });
});
