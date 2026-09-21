import { describe, expect, it } from "vitest";

import {
  HEATMAP_LEVELS,
  barHeight,
  heatmapLevel,
  heatmapMax,
  heatmapWeeks,
  seriesPeak,
} from "./series";
import type { SeriesPoint } from "./types";

function point(bucket: string, fields: Partial<SeriesPoint> = {}): SeriesPoint {
  return {
    bucket,
    completed_todos: 0,
    completed_points: 0,
    unestimated_completed: 0,
    created_todos: 0,
    comments: 0,
    activities: 0,
    ...fields,
  };
}

describe("seriesPeak", () => {
  it("is the tallest bucket for the chosen metric", () => {
    const points = [
      point("a", { completed_todos: 2, activities: 40 }),
      point("b", { completed_todos: 9, activities: 1 }),
    ];

    expect(seriesPeak(points, "completed_todos")).toBe(9);
    expect(seriesPeak(points, "activities")).toBe(40);
  });

  it("never drops to zero, so an empty period cannot divide by it", () => {
    expect(seriesPeak([], "completed_todos")).toBe(1);
    expect(seriesPeak([point("a"), point("b")], "comments")).toBe(1);
  });
});

describe("barHeight", () => {
  it("is the value as a share of the peak", () => {
    expect(barHeight(5, 10)).toBe("50%");
    expect(barHeight(10, 10)).toBe("100%");
  });

  it("is nothing for an empty bucket", () => {
    expect(barHeight(0, 10)).toBe("0%");
  });

  it("keeps one event visible instead of rounding it away", () => {
    expect(barHeight(1, 500)).toBe("3%");
  });
});

describe("heatmapLevel", () => {
  it("is zero only when nothing was completed", () => {
    expect(heatmapLevel(0, 10)).toBe(0);
    expect(heatmapLevel(1, 10)).toBeGreaterThan(0);
  });

  it("scales against the person's own maximum, not an absolute", () => {
    expect(heatmapLevel(10, 10)).toBe(HEATMAP_LEVELS - 1);
    expect(heatmapLevel(30, 30)).toBe(HEATMAP_LEVELS - 1);
  });

  it("stays inside the ramp", () => {
    for (const count of [1, 2, 5, 9, 10, 100]) {
      const level = heatmapLevel(count, 10);

      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(HEATMAP_LEVELS - 1);
    }
  });

  it("does not divide by an empty year", () => {
    expect(heatmapLevel(0, 0)).toBe(0);
    expect(heatmapLevel(3, 0)).toBe(0);
  });
});

describe("heatmapMax", () => {
  it("is the busiest day, or zero when there are none", () => {
    expect(
      heatmapMax([
        { date: "2026-09-01", count: 3 },
        { date: "2026-09-02", count: 7 },
      ]),
    ).toBe(7);
    expect(heatmapMax([])).toBe(0);
  });
});

describe("heatmapWeeks", () => {
  it("chunks the window into columns of seven", () => {
    const weeks = heatmapWeeks("2026-09-06", "2026-09-19", []);

    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[1]).toHaveLength(7);
  });

  it("fills a day that has no row with zero rather than leaving a hole", () => {
    const weeks = heatmapWeeks("2026-09-06", "2026-09-12", [
      { date: "2026-09-08", count: 4 },
    ]);

    expect(weeks[0]!.map((day) => day.count)).toEqual([0, 0, 4, 0, 0, 0, 0]);
  });

  it("starts on the day the window starts, which the server aligned to a Sunday", () => {
    const weeks = heatmapWeeks("2026-09-06", "2026-09-12", []);

    expect(weeks[0]![0]!.date).toBe("2026-09-06");
    expect(new Date(`${weeks[0]![0]!.date}T00:00:00.000Z`).getUTCDay()).toBe(0);
  });

  it("keeps a ragged final week rather than dropping the days in it", () => {
    const weeks = heatmapWeeks("2026-09-06", "2026-09-15", []);

    expect(weeks).toHaveLength(2);
    expect(weeks[1]).toHaveLength(3);
  });

  it("tolerates a timestamp rather than a bare date", () => {
    const weeks = heatmapWeeks(
      "2026-09-06T00:00:00.000Z",
      "2026-09-12T23:59:00.000Z",
      [],
    );

    expect(weeks[0]).toHaveLength(7);
  });

  it("returns nothing for a window that makes no sense", () => {
    expect(heatmapWeeks("2026-09-20", "2026-09-06", [])).toEqual([]);
    expect(heatmapWeeks("not-a-date", "2026-09-06", [])).toEqual([]);
  });
});
