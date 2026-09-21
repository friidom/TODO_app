import { describe, expect, it } from "vitest";

import { bucketFromRatio, stepBucket, tooltipAnchor } from "./hover";

describe("bucketFromRatio", () => {
  it("maps a pointer position across the plot to a bucket", () => {
    expect(bucketFromRatio(0, 4)).toBe(0);
    expect(bucketFromRatio(0.24, 4)).toBe(0);
    expect(bucketFromRatio(0.26, 4)).toBe(1);
    expect(bucketFromRatio(0.99, 4)).toBe(3);
  });

  it("clamps rather than returning a bucket that does not exist", () => {
    expect(bucketFromRatio(1, 4)).toBe(3);
    expect(bucketFromRatio(1.4, 4)).toBe(3);
    expect(bucketFromRatio(-0.2, 4)).toBe(0);
  });

  it("has nothing to point at when there are no buckets", () => {
    expect(bucketFromRatio(0.5, 0)).toBeNull();
    expect(bucketFromRatio(Number.NaN, 4)).toBeNull();
  });
});

describe("stepBucket", () => {
  it("enters from the correct end when nothing is hovered yet", () => {
    expect(stepBucket(null, 1, 5)).toBe(0);
    expect(stepBucket(null, -1, 5)).toBe(4);
  });

  it("stops at the ends rather than wrapping", () => {
    expect(stepBucket(4, 1, 5)).toBe(4);
    expect(stepBucket(0, -1, 5)).toBe(0);
    expect(stepBucket(2, 1, 5)).toBe(3);
  });

  it("is null when there is nothing to step through", () => {
    expect(stepBucket(0, 1, 0)).toBeNull();
  });
});

describe("tooltipAnchor", () => {
  it("anchors to the middle of the bucket's slot", () => {
    expect(tooltipAnchor(0, 4).left).toBe(12.5);
    expect(tooltipAnchor(3, 4).left).toBe(87.5);
  });

  it("flips before the tooltip would run off the right edge", () => {
    expect(tooltipAnchor(0, 4).flip).toBe(false);
    expect(tooltipAnchor(3, 4).flip).toBe(true);
  });

  it("does not divide by zero on an empty chart", () => {
    expect(tooltipAnchor(0, 0)).toEqual({ left: 0, flip: false });
  });
});
