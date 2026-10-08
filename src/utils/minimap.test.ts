import { describe, expect, it } from "vitest";

import { minimapViewport, scrollLeftAt, trackRatio } from "./minimap";

describe("minimapViewport", () => {
  it("is null when the content fits", () => {
    expect(minimapViewport(0, 800, 800)).toBeNull();
    expect(minimapViewport(0, 800, 500)).toBeNull();
  });

  it("is null for an unmeasured scroller", () => {
    expect(minimapViewport(0, 0, 1600)).toBeNull();
  });

  it("covers the visible fraction, starting at the left", () => {
    expect(minimapViewport(0, 800, 2000)).toEqual({ left: 0, width: 0.4 });
  });

  it("tracks the scroll position", () => {
    const view = minimapViewport(600, 800, 2000);

    expect(view?.left).toBeCloseTo(0.3);
    expect(view?.width).toBeCloseTo(0.4);
  });

  it("stops at the right edge when scrolled to the end", () => {
    const view = minimapViewport(1200, 800, 2000);

    expect(view?.left).toBeCloseTo(0.6);
    expect((view?.left ?? 0) + (view?.width ?? 0)).toBeCloseTo(1);
  });

  it("clamps an overscroll bounce back into the track", () => {
    expect(minimapViewport(-40, 800, 2000)?.left).toBe(0);

    const past = minimapViewport(1500, 800, 2000);

    expect((past?.left ?? 0) + (past?.width ?? 0)).toBeCloseTo(1);
  });
});

describe("scrollLeftAt", () => {
  it("centres the window on the pointer", () => {
    expect(scrollLeftAt(0.5, 800, 2000)).toBe(600);
  });

  it("clamps at both ends", () => {
    expect(scrollLeftAt(0, 800, 2000)).toBe(0);
    expect(scrollLeftAt(0.1, 800, 2000)).toBe(0);
    expect(scrollLeftAt(1, 800, 2000)).toBe(1200);
  });

  it("is zero when nothing overflows", () => {
    expect(scrollLeftAt(0.7, 800, 800)).toBe(0);
  });

  it("round-trips with minimapViewport", () => {
    const scrollLeft = scrollLeftAt(0.5, 800, 2000);
    const view = minimapViewport(scrollLeft, 800, 2000);

    expect((view?.left ?? 0) + (view?.width ?? 0) / 2).toBeCloseTo(0.5);
  });
});

describe("trackRatio", () => {
  it("maps a pointer to a fraction of the track", () => {
    expect(trackRatio(150, 100, 200)).toBe(0.25);
  });

  it("clamps a pointer outside the track", () => {
    expect(trackRatio(50, 100, 200)).toBe(0);
    expect(trackRatio(400, 100, 200)).toBe(1);
  });

  it("answers 0 for a track with no width", () => {
    expect(trackRatio(150, 100, 0)).toBe(0);
  });
});
