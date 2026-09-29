import { describe, expect, it } from "vitest";

import {
  NODE_H,
  NODE_W,
  canvasSize,
  defaultLayout,
  edgeSegment,
  nodeAt,
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

describe("nodeAt", () => {
  it("finds the node under a point and skips the excluded one", () => {
    const layout = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } };

    expect(nodeAt(layout, { x: 210, y: 10 })).toBe("b");
    expect(nodeAt(layout, { x: 210, y: 10 }, "b")).toBeNull();
    expect(nodeAt(layout, { x: 150, y: 10 })).toBeNull();
  });
});

describe("canvasSize", () => {
  it("grows to hold a node dragged far away", () => {
    expect(canvasSize({ a: { x: 1500, y: 700 } }).width).toBeGreaterThan(1500);
  });
});
