import { describe, expect, it } from "vitest";

import {
  COMPLETION_BACKFILL_DATE,
  backfillNote,
  coversBackfill,
} from "./backfill";

describe("coversBackfill", () => {
  it("is true for a window reaching before the migration", () => {
    expect(coversBackfill("2026-01-01T00:00:00.000Z")).toBe(true);
  });

  it("is false for a window that starts on or after it", () => {
    expect(coversBackfill(`${COMPLETION_BACKFILL_DATE}T00:00:00.000Z`)).toBe(
      false,
    );
    expect(coversBackfill("2027-03-01T00:00:00.000Z")).toBe(false);
  });
});

describe("backfillNote", () => {
  it("says so, and names the date, when the window reaches back that far", () => {
    const note = backfillNote("2026-01-01T00:00:00.000Z");

    expect(note).toContain(COMPLETION_BACKFILL_DATE);
    expect(note).toContain("approximated");
  });

  it("stays quiet when every completion in the window was observed", () => {
    expect(backfillNote("2027-01-01T00:00:00.000Z")).toBeUndefined();
  });
});
