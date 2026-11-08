import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIMELINE_COLUMNS,
  TIMELINE_COLUMNS,
  isTimelineColumnShown,
  normalizeTimelineColumns,
  railVariables,
  withTimelineColumnShown,
  withTimelineColumnWidth,
} from "./timelineColumns";

describe("timeline columns", () => {
  it("clamps a width to the column's floor and the shared ceiling", () => {
    const narrow = withTimelineColumnWidth(
      DEFAULT_TIMELINE_COLUMNS,
      "work",
      10,
    );
    const wide = withTimelineColumnWidth(
      DEFAULT_TIMELINE_COLUMNS,
      "status",
      9999,
    );

    expect(narrow.widths.work).toBe(TIMELINE_COLUMNS.work.min);
    expect(wide.widths.status).toBe(640);
    expect(withTimelineColumnWidth(narrow, "work", null).widths).toEqual({});
  });

  it("can hide an optional column but never the work column", () => {
    const hidden = withTimelineColumnShown(
      DEFAULT_TIMELINE_COLUMNS,
      "status",
      false,
    );

    expect(isTimelineColumnShown(hidden, "status")).toBe(false);
    expect(
      withTimelineColumnShown(DEFAULT_TIMELINE_COLUMNS, "work", false),
    ).toBe(DEFAULT_TIMELINE_COLUMNS);
  });

  it("writes a hidden column as zero, so the rail closes up", () => {
    const prefs = withTimelineColumnShown(
      withTimelineColumnWidth(DEFAULT_TIMELINE_COLUMNS, "work", 360),
      "assignee",
      false,
    );

    expect(railVariables(prefs)).toEqual({
      "--tl-work": "360px",
      "--tl-status": `${TIMELINE_COLUMNS.status.width}px`,
      "--tl-assignee": "0px",
    });
  });

  it("repairs whatever storage hands back", () => {
    expect(normalizeTimelineColumns("nope")).toEqual(DEFAULT_TIMELINE_COLUMNS);
    expect(
      normalizeTimelineColumns({
        widths: { work: 400, bogus: 1, status: "wide" },
        hidden: ["assignee", "work", "nope", "assignee"],
      }),
    ).toEqual({ widths: { work: 400 }, hidden: ["assignee"] });
  });
});
