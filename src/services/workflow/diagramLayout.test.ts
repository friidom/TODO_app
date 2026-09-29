import { describe, expect, it } from "vitest";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_H,
  NODE_W,
  clampZoom,
  contentBounds,
  defaultLayout,
  edgePath,
  edgeSegment,
  fitView,
  nodeAt,
  zoomAt,
} from "./diagramLayout";

describe("defaultLayout", () => {
  it("puts each stage in its own column and stacks statuses inside it", () => {
    const layout = defaultLayout([
      { id: "a", category: "todo" },
      { id: "b", category: "todo" },
      { id: "c", category: "done" },
    ]);

    expect(layout.a!.x).toBe(layout.b!.x);
    expect(layout.b!.y).toBeGreaterThan(layout.a!.y);
    expect(layout.c!.x).toBeGreaterThan(layout.a!.x);
  });

  it("centres a short stage against the tallest one", () => {
    const layout = defaultLayout([
      { id: "a", category: "todo" },
      { id: "b", category: "todo" },
      { id: "c", category: "todo" },
      { id: "d", category: "done" },
    ]);

    const middle = (layout.a!.y + layout.c!.y) / 2;

    expect(layout.d!.y).toBeCloseTo(middle);
  });
});

describe("edgeSegment", () => {
  it("runs from the right border of the source to the left border of the target", () => {
    const segment = edgeSegment({ x: 0, y: 0 }, { x: 300, y: 0 });

    expect(segment.x1).toBeCloseTo(NODE_W);
    expect(segment.y1).toBeCloseTo(NODE_H / 2);
    expect(segment.x2).toBeLessThan(300);
    expect(segment.x2).toBeGreaterThan(segment.x1);
  });

  it("separates a pair of opposite edges", () => {
    const there = edgeSegment({ x: 0, y: 0 }, { x: 300, y: 0 }, 7);
    const back = edgeSegment({ x: 300, y: 0 }, { x: 0, y: 0 }, 7);

    expect(there.y1).not.toBeCloseTo(back.y1);
  });
});

describe("edgePath", () => {
  it("leaves a forward edge from the source's right border", () => {
    const { d } = edgePath({ x: 0, y: 0 }, { x: 400, y: 0 });

    expect(d.startsWith("M " + NODE_W + " " + NODE_H / 2)).toBe(true);
  });

  it("draws a straight run when both nodes share a row", () => {
    const { d } = edgePath({ x: 0, y: 0 }, { x: 400, y: 0 });

    expect(d).not.toContain("Q");
  });

  it("turns a corner when the rows differ", () => {
    const { d } = edgePath({ x: 0, y: 0 }, { x: 400, y: 200 });

    expect(d).toContain("Q");
  });

  it("routes a backward edge below both nodes", () => {
    const { d, mid } = edgePath({ x: 400, y: 0 }, { x: 0, y: 0 });

    expect(mid.y).toBeGreaterThan(NODE_H);
    expect(d).toContain("Q");
  });

  it("separates two backward edges by lane", () => {
    const first = edgePath({ x: 400, y: 0 }, { x: 0, y: 0 }, 0);
    const second = edgePath({ x: 400, y: 0 }, { x: 0, y: 0 }, 1);

    expect(second.mid.y).toBeGreaterThan(first.mid.y);
  });

  it("puts the midpoint between the two nodes on a forward edge", () => {
    const { mid } = edgePath({ x: 0, y: 0 }, { x: 400, y: 0 });

    expect(mid.x).toBeGreaterThan(NODE_W);
    expect(mid.x).toBeLessThan(400);
  });
});

describe("nodeAt", () => {
  it("finds the node under a point and skips the excluded one", () => {
    const layout = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } };

    expect(nodeAt(layout, { x: 410, y: 10 })).toBe("b");
    expect(nodeAt(layout, { x: 410, y: 10 }, "b")).toBeNull();
    expect(nodeAt(layout, { x: 300, y: 10 })).toBeNull();
  });
});

describe("contentBounds", () => {
  it("covers every node including its box", () => {
    const bounds = contentBounds({
      a: { x: 10, y: 20 },
      b: { x: 210, y: 120 },
    });

    expect(bounds.x).toBe(10);
    expect(bounds.y).toBe(20);
    expect(bounds.width).toBe(200 + NODE_W);
    expect(bounds.height).toBe(100 + NODE_H);
  });

  it("stays a real box when there is nothing to measure", () => {
    expect(contentBounds({}).width).toBeGreaterThan(0);
  });
});

describe("clampZoom", () => {
  it("holds the zoom inside its range", () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("fitView", () => {
  it("never zooms a small workflow past its own size", () => {
    const view = fitView({ a: { x: 0, y: 0 } }, { width: 2000, height: 1200 });

    expect(view.zoom).toBe(1);
  });

  it("shrinks a workflow that is wider than the viewport", () => {
    const layout = defaultLayout(
      Array.from({ length: 12 }, (_, i) => ({
        id: String(i),
        category: "todo",
      })),
    );

    expect(fitView(layout, { width: 600, height: 400 }).zoom).toBeLessThan(1);
  });

  it("centres what it fits", () => {
    const viewport = { width: 1000, height: 600 };
    const view = fitView({ a: { x: 0, y: 0 } }, viewport);
    const left = view.x;
    const right = viewport.width - (left + NODE_W * view.zoom);

    expect(left).toBeCloseTo(right);
  });
});

describe("zoomAt", () => {
  it("keeps the focused point still", () => {
    const view = { zoom: 1, x: 0, y: 0 };
    const focus = { x: 300, y: 200 };
    const next = zoomAt(view, 2, focus);

    const before = (focus.x - view.x) / view.zoom;
    const after = (focus.x - next.x) / next.zoom;

    expect(after).toBeCloseTo(before);
  });

  it("refuses to zoom past the range", () => {
    expect(zoomAt({ zoom: 1, x: 0, y: 0 }, 99, { x: 0, y: 0 }).zoom).toBe(
      MAX_ZOOM,
    );
  });
});
