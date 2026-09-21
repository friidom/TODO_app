import { describe, expect, it } from "vitest";

import {
  agingRows,
  bandValueAt,
  barShare,
  bucketRange,
  cfdBands,
  cfdPeak,
  cfdTotalAt,
  hasDurations,
  histogramPeak,
  monotoneSlopes,
  percentileOffset,
  proportionOf,
  smoothAreaPath,
  smoothLinePath,
  totalOf,
  xOf,
  yOf,
} from "./flow";
import type { AgingBucket, CfdPoint, DurationBin } from "./types";

function point(
  bucket: string,
  created: number,
  started: number,
  done: number,
): CfdPoint {
  return { bucket, created, started, done };
}

const SCALE = { height: 40, headroom: 3, peak: 10 };

describe("cfdBands", () => {
  it("stacks done on the floor, then in progress, then backlog", () => {
    const bands = cfdBands([point("d1", 10, 6, 2)]);

    expect(bands.map((band) => band.key)).toEqual([
      "done",
      "in_progress",
      "backlog",
    ]);
    expect(bands[0].lower).toEqual([0]);
    expect(bands[0].upper).toEqual([2]);
    expect(bands[1].lower).toEqual([2]);
    expect(bands[1].upper).toEqual([6]);
    expect(bands[2].lower).toEqual([6]);
    expect(bands[2].upper).toEqual([10]);
  });

  it("reports each band's thickness, not its edge", () => {
    const bands = cfdBands([point("d1", 10, 6, 2)]);

    expect(bandValueAt(bands[0], 0)).toBe(2);
    expect(bandValueAt(bands[1], 0)).toBe(4);
    expect(bandValueAt(bands[2], 0)).toBe(4);
  });

  it("clamps a completion with no start rather than inverting the band", () => {
    const bands = cfdBands([point("d1", 12, 0, 7)]);

    expect(bands[1].lower).toEqual([7]);
    expect(bands[1].upper).toEqual([7]);
    expect(bandValueAt(bands[1], 0)).toBe(0);
    expect(bandValueAt(bands[2], 0)).toBe(5);
  });

  it("clamps a started count above created the same way", () => {
    const bands = cfdBands([point("d1", 3, 9, 1)]);

    expect(bands[2].upper).toEqual([9]);
    expect(bandValueAt(bands[2], 0)).toBe(0);
  });

  it("never lets a band go negative", () => {
    const bands = cfdBands([point("d1", 0, 0, -4)]);

    for (const band of bands)
      expect(bandValueAt(band, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe("cfdPeak", () => {
  it("is the tallest total, floored at one so an empty window still divides", () => {
    expect(cfdPeak([])).toBe(1);
    expect(cfdPeak([point("d1", 0, 0, 0)])).toBe(1);
    expect(cfdPeak([point("d1", 4, 2, 1), point("d2", 9, 5, 3)])).toBe(9);
  });

  it("uses the clamped total, so a backfilled completion still raises it", () => {
    expect(cfdPeak([point("d1", 2, 0, 11)])).toBe(11);
  });
});

describe("the plot scale", () => {
  it("centres a bucket in its slot rather than on the axis edge", () => {
    expect(xOf(0, 4)).toBe(12.5);
    expect(xOf(3, 4)).toBe(87.5);
    expect(xOf(0, 0)).toBe(0);
  });

  it("puts zero on the floor and the peak a headroom short of the ceiling", () => {
    expect(yOf(0, SCALE)).toBe(40);
    expect(yOf(10, SCALE)).toBe(3);
  });
});

describe("percentileOffset", () => {
  const bins: DurationBin[] = [
    { from_days: 0, to_days: 2, count: 5 },
    { from_days: 2, to_days: 4, count: 3 },
    { from_days: 4, to_days: null, count: 1 },
  ];

  it("has nothing to place when the percentile is unmeasured", () => {
    expect(percentileOffset(null, bins)).toBeNull();
    expect(percentileOffset(3, [])).toBeNull();
  });

  it("places the marker proportionally inside the bin it falls in", () => {
    expect(percentileOffset(0, bins)).toBeCloseTo(0);
    expect(percentileOffset(1, bins)).toBeCloseTo(100 / 3 / 2);
    expect(percentileOffset(3, bins)).toBeCloseTo(100 / 3 + 100 / 3 / 2);
  });

  it("puts the open bin's marker in the middle of it, having no width to scale by", () => {
    expect(percentileOffset(99, bins)).toBeCloseTo(100 / 3 / 2 + 200 / 3);
  });

  it("clamps below the first bin rather than dropping the marker", () => {
    expect(percentileOffset(-5, bins)).toBe(0);
  });
});

describe("histogramPeak", () => {
  it("is floored at one, so an all-empty histogram still renders a baseline", () => {
    expect(histogramPeak([])).toBe(1);
    expect(histogramPeak([{ from_days: 0, to_days: 2, count: 0 }])).toBe(1);
    expect(histogramPeak([{ from_days: 0, to_days: 2, count: 7 }])).toBe(7);
  });
});

describe("bar proportions", () => {
  it("scales a bar against the peak and a percentage against the total", () => {
    expect(barShare(5, 10)).toBe(50);
    expect(barShare(0, 10)).toBe(0);
    expect(barShare(5, 0)).toBe(0);
    expect(proportionOf(1, 4)).toBe(25);
    expect(proportionOf(1, 0)).toBe(0);
  });

  it("never exceeds the track it is drawn in", () => {
    expect(barShare(30, 10)).toBe(100);
  });
});

describe("agingRows", () => {
  const buckets: AgingBucket[] = [
    { key: "0-2", label: "0–2d", from_days: 0, to_days: 2, count: 8 },
    { key: "3-7", label: "3–7d", from_days: 3, to_days: 7, count: 0 },
    { key: "30+", label: "30d+", from_days: 30, to_days: null, count: 2 },
  ];

  it("keeps an empty bucket as a row rather than dropping it", () => {
    expect(agingRows(buckets)).toHaveLength(3);
    expect(agingRows(buckets)[1].bucket.count).toBe(0);
    expect(agingRows(buckets)[1].percent).toBe(0);
  });

  it("scales the longest bar to the full track", () => {
    expect(agingRows(buckets)[0].percent).toBe(100);
    expect(agingRows(buckets)[2].percent).toBe(25);
  });

  it("reports each bucket's share of the whole", () => {
    expect(totalOf(buckets)).toBe(10);
    expect(agingRows(buckets)[2].share).toBe(20);
  });
});

describe("hasDurations", () => {
  it("is false when nothing was measured", () => {
    expect(
      hasDurations({
        median_days: null,
        p75_days: null,
        p90_days: null,
        n: 0,
        unmeasured: 12,
      }),
    ).toBe(false);
    expect(
      hasDurations({
        median_days: null,
        p75_days: null,
        p90_days: null,
        n: 4,
        unmeasured: 0,
      }),
    ).toBe(false);
  });

  it("is true once there is a median over a real population", () => {
    expect(
      hasDurations({
        median_days: 4.2,
        p75_days: 9,
        p90_days: 18,
        n: 214,
        unmeasured: 38,
      }),
    ).toBe(true);
  });
});

describe("hiding a band", () => {
  const points = [point("d1", 10, 6, 2), point("d2", 20, 12, 5)];

  it("restacks the remaining bands with no gap left behind", () => {
    const bands = cfdBands(points, new Set(["in_progress"]));

    expect(bands.map((band) => band.key)).toEqual(["done", "backlog"]);
    expect(bands[0].lower).toEqual([0, 0]);
    expect(bands[0].upper).toEqual([2, 5]);
    expect(bands[1].lower).toEqual([2, 5]);
    expect(bands[1].upper).toEqual([6, 13]);
  });

  it("keeps each band's own thickness when another is hidden", () => {
    const full = cfdBands(points);
    const partial = cfdBands(points, new Set(["in_progress"]));

    expect(bandValueAt(partial[1], 0)).toBe(bandValueAt(full[2], 0));
  });

  it("lowers the peak to the top of what is still visible", () => {
    expect(cfdPeak(points)).toBe(20);
    expect(cfdPeak(points, new Set(["backlog"]))).toBe(12);
    expect(cfdPeak(points, new Set(["backlog", "in_progress"]))).toBe(5);
  });

  it("falls back to one when everything is hidden", () => {
    expect(cfdPeak(points, new Set(["done", "in_progress", "backlog"]))).toBe(
      1,
    );
    expect(
      cfdBands(points, new Set(["done", "in_progress", "backlog"])),
    ).toEqual([]);
  });
});

describe("cfdTotalAt", () => {
  it("is the clamped total, so a hidden band does not change it", () => {
    expect(cfdTotalAt([point("d1", 10, 6, 2)], 0)).toBe(10);
    expect(cfdTotalAt([point("d1", 2, 0, 11)], 0)).toBe(11);
    expect(cfdTotalAt([], 0)).toBe(0);
  });
});

describe("monotoneSlopes", () => {
  it("is flat where the data turns, so the curve cannot overshoot", () => {
    expect(monotoneSlopes([0, 10, 0])[1]).toBe(0);
  });

  it("is zero across a flat run", () => {
    expect(monotoneSlopes([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it("handles series too short to have a slope", () => {
    expect(monotoneSlopes([])).toEqual([]);
    expect(monotoneSlopes([3])).toEqual([0]);
  });
});

describe("smooth paths", () => {
  const scale = { height: 40, headroom: 3, peak: 10 };

  it("are empty for an empty series rather than full of NaN", () => {
    expect(smoothLinePath([], scale)).toBe("");
    expect(
      smoothAreaPath(
        { key: "done", label: "Done", upper: [], lower: [] },
        scale,
      ),
    ).toBe("");
  });

  it("emit a cubic segment between each pair of points", () => {
    const path = smoothLinePath([0, 10], scale);

    expect(path.startsWith("M ")).toBe(true);
    expect(path.split(" C ")).toHaveLength(2);
    expect(path).not.toContain("NaN");
  });

  it("close the area and return along the lower edge", () => {
    const path = smoothAreaPath(
      { key: "done", label: "Done", upper: [4, 8], lower: [0, 0] },
      scale,
    );

    expect(path.endsWith(" Z")).toBe(true);
    expect(path.split(" C ")).toHaveLength(3);
    expect(path).not.toContain("NaN");
  });
});

describe("bucketRange", () => {
  const buckets = [
    "2026-09-18T00:00:00",
    "2026-09-19T00:00:00",
    "2026-09-20T00:00:00",
  ];
  const windowTo = "2026-09-21T09:00:00.000Z";

  it("runs from one bucket to the next", () => {
    expect(bucketRange(buckets, 0, windowTo)).toEqual({
      from: "2026-09-18T00:00:00Z",
      to: "2026-09-19T00:00:00Z",
    });
  });

  it("runs the last bucket to the end of the window", () => {
    expect(bucketRange(buckets, 2, windowTo)).toEqual({
      from: "2026-09-20T00:00:00Z",
      to: windowTo,
    });
  });

  it("is null for a bucket that does not exist", () => {
    expect(bucketRange(buckets, 9, windowTo)).toBeNull();
    expect(bucketRange([], 0, windowTo)).toBeNull();
  });
});
