import { describe, expect, it } from "vitest";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_H,
  NODE_W,
  autoLayout,
  clampZoom,
  contentBounds,
  displayEdges,
  drawnAs,
  edgeSegment,
  fitView,
  freeSpot,
  placeNew,
  nodeAt,
  revealed,
  routeEdges,
  zoomAt,
  type DisplayEdge,
  type Point,
} from "./diagramLayout";

const one = (from: string, to: string): DisplayEdge => ({
  from,
  to,
  twoWay: false,
});

function route(
  layout: Record<string, Point>,
  edges: DisplayEdge[],
  key: string,
) {
  const found = routeEdges(layout, edges).get(key);

  if (!found) throw new Error(`no route for ${key}`);

  return found;
}

// The corners of an orthogonal route: its start, each rounded corner's control
// point, and its end.
function polyline(d: string): Point[] {
  const numbers = (text: string) => text.trim().split(/\s+/).map(Number);
  const [x, y] = numbers(d.slice(1, d.indexOf("L")));
  const corners = [...d.matchAll(/Q ([\d.-]+) ([\d.-]+)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));
  const last = numbers(d.slice(d.lastIndexOf("L") + 1));

  return [{ x: x!, y: y! }, ...corners, { x: last[0]!, y: last[1]! }];
}

function crossings(a: Point[], b: Point[]): number {
  let count = 0;

  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const [p, q] = [a[i - 1]!, a[i]!];
      const [r, s] = [b[j - 1]!, b[j]!];
      const horizontal = p.y === q.y ? [p, q] : r.y === s.y ? [r, s] : null;
      const vertical = p.x === q.x ? [p, q] : r.x === s.x ? [r, s] : null;

      if (!horizontal || !vertical || horizontal === vertical) continue;

      const [h1, h2] = horizontal;
      const [v1, v2] = vertical;
      const inX =
        v1!.x > Math.min(h1!.x, h2!.x) && v1!.x < Math.max(h1!.x, h2!.x);
      const inY =
        h1!.y > Math.min(v1!.y, v2!.y) && h1!.y < Math.max(v1!.y, v2!.y);

      if (inX && inY) count++;
    }
  }

  return count;
}

describe("autoLayout", () => {
  it("puts each stage in its own column and stacks statuses inside it", () => {
    const layout = autoLayout([
      { id: "a", category: "todo" },
      { id: "b", category: "todo" },
      { id: "c", category: "done" },
    ]);

    expect(layout.a!.x).toBe(layout.b!.x);
    expect(layout.b!.y).toBeGreaterThan(layout.a!.y);
    expect(layout.c!.x).toBeGreaterThan(layout.a!.x);
  });

  it("centres a short stage against the tallest one", () => {
    const layout = autoLayout([
      { id: "a", category: "todo" },
      { id: "b", category: "todo" },
      { id: "c", category: "todo" },
      { id: "d", category: "done" },
    ]);

    const middle = (layout.a!.y + layout.c!.y) / 2;

    expect(layout.d!.y).toBeCloseTo(middle);
  });

  it("leaves no empty column for a stage the workflow does not use", () => {
    const layout = autoLayout([
      { id: "a", category: "todo" },
      { id: "b", category: "done" },
    ]);

    expect(layout.b!.x - layout.a!.x).toBeLessThan(2 * NODE_W);
  });

  it("reorders a column so crossed lines untangle", () => {
    const layout = autoLayout(
      [
        { id: "a", category: "todo" },
        { id: "b", category: "todo" },
        { id: "c", category: "in_progress" },
        { id: "d", category: "in_progress" },
      ],
      [
        { from: "a", to: "d" },
        { from: "b", to: "c" },
      ],
    );

    expect(layout.d!.y).toBeLessThan(layout.c!.y);
  });

  it("keeps board order when every status connects to every other", () => {
    const layout = autoLayout(
      [
        { id: "a", category: "todo" },
        { id: "b", category: "in_progress" },
        { id: "c", category: "in_progress" },
      ],
      [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
      ],
    );

    expect(layout.b!.y).toBeLessThan(layout.c!.y);
  });

  it("widens a gap that many lines have to run through", () => {
    const statuses = [
      { id: "a", category: "todo" },
      { id: "b", category: "todo" },
      { id: "c", category: "todo" },
      { id: "d", category: "done" },
      { id: "e", category: "done" },
      { id: "f", category: "done" },
    ];
    const busy = ["a", "b", "c"].flatMap((from) =>
      ["d", "e", "f"].map((to) => ({ from, to })),
    );

    const quiet = autoLayout(statuses);
    const crowded = autoLayout(statuses, busy);

    expect(crowded.d!.x - crowded.a!.x).toBeGreaterThan(
      quiet.d!.x - quiet.a!.x,
    );
  });
});

describe("displayEdges", () => {
  const ids = ["a", "b", "c", "d"];

  it("shows a status every other status can reach as an 'any' target, without its arrows", () => {
    const { edges, anyTargets } = displayEdges(ids, [
      { from: "a", to: "d" },
      { from: "b", to: "d" },
      { from: "c", to: "d" },
      { from: "a", to: "b" },
    ]);

    expect([...anyTargets]).toEqual(["d"]);
    expect(edges).toEqual([one("a", "b")]);
  });

  it("keeps every arrow in a workflow too small for a badge to save any", () => {
    const { edges, anyTargets } = displayEdges(
      ["a", "b", "c"],
      [
        { from: "a", to: "c" },
        { from: "b", to: "c" },
      ],
    );

    expect(anyTargets.size).toBe(0);
    expect(edges).toHaveLength(2);
  });

  it("draws a pair that points both ways once, in board order", () => {
    const { edges } = displayEdges(ids, [
      { from: "c", to: "a" },
      { from: "a", to: "c" },
    ]);

    expect(edges).toEqual([{ from: "a", to: "c", twoWay: true }]);
  });

  it("ignores self-transitions and transitions to statuses not shown", () => {
    const { edges } = displayEdges(ids, [
      { from: "a", to: "a" },
      { from: "a", to: "gone" },
    ]);

    expect(edges).toEqual([]);
  });
});

describe("drawnAs", () => {
  it("matches a two-way line in either direction and a one-way line in its own", () => {
    expect(drawnAs({ from: "a", to: "b", twoWay: true }, "b", "a")).toBe(true);
    expect(drawnAs(one("a", "b"), "b", "a")).toBe(false);
    expect(drawnAs(one("a", "b"), "a", "b")).toBe(true);
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

describe("routeEdges", () => {
  const pair = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } };

  it("leaves a forward edge from the source's right border", () => {
    const { d } = route(pair, [one("a", "b")], "a>b");

    expect(d.startsWith("M " + NODE_W + " " + NODE_H / 2)).toBe(true);
  });

  it("draws a straight run when both nodes share a row", () => {
    const { d } = route(pair, [one("a", "b")], "a>b");

    expect(d).not.toContain("Q");
  });

  it("turns a corner when the rows differ", () => {
    const { d } = route(
      { a: { x: 0, y: 0 }, b: { x: 400, y: 200 } },
      [one("a", "b")],
      "a>b",
    );

    expect(d).toContain("Q");
  });

  it("routes a backward edge below both nodes", () => {
    const { d, mid } = route(pair, [one("b", "a")], "b>a");

    expect(mid.y).toBeGreaterThan(NODE_H);
    expect(d).toContain("Q");
  });

  it("separates two backward edges by lane", () => {
    const layout = {
      a: { x: 0, y: 0 },
      b: { x: 400, y: 0 },
      c: { x: 800, y: 0 },
    };
    const routes = routeEdges(layout, [one("b", "a"), one("c", "a")]);

    expect(routes.get("c>a")!.mid.y).toBeGreaterThan(routes.get("b>a")!.mid.y);
  });

  it("puts the midpoint between the two nodes on a forward edge", () => {
    const { mid } = route(pair, [one("a", "b")], "a>b");

    expect(mid.x).toBeGreaterThan(NODE_W);
    expect(mid.x).toBeLessThan(400);
  });

  it("spreads the ends of lines that meet one side of a node", () => {
    const layout = {
      a: { x: 0, y: 100 },
      b: { x: 400, y: 0 },
      c: { x: 400, y: 200 },
    };
    const routes = routeEdges(layout, [one("a", "b"), one("a", "c")]);

    expect(polyline(routes.get("a>b")!.d)[0]!.y).toBeLessThan(
      polyline(routes.get("a>c")!.d)[0]!.y,
    );
  });

  it("orders lines through one gap so they do not cross", () => {
    const layout = {
      a: { x: 0, y: 0 },
      b: { x: 0, y: 100 },
      c: { x: 400, y: 200 },
      d: { x: 400, y: 300 },
    };
    const routes = routeEdges(layout, [one("a", "c"), one("b", "d")]);

    expect(
      crossings(polyline(routes.get("a>c")!.d), polyline(routes.get("b>d")!.d)),
    ).toBe(0);
  });

  it("goes over the top rather than through a node in the way", () => {
    const layout = {
      a: { x: 0, y: 0 },
      blocker: { x: 300, y: 0 },
      b: { x: 600, y: 0 },
    };

    expect(route(layout, [one("a", "b")], "a>b").mid.y).toBeLessThan(0);
  });

  it("joins two stacked statuses with a bracket beside them", () => {
    const layout = { a: { x: 0, y: 0 }, b: { x: 0, y: 200 } };

    expect(route(layout, [one("a", "b")], "a>b").mid.x).toBeGreaterThan(NODE_W);
  });

  it("keeps many brackets in the near half of the gap beside their column", () => {
    const layout = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`s${i}`, { x: 0, y: i * 100 }]),
    );
    const brackets = Object.keys(layout).flatMap((a, i) =>
      Object.keys(layout)
        .slice(i + 1)
        .map((b) => one(a, b)),
    );
    const routes = routeEdges(layout, brackets);
    const furthest = Math.max(
      ...[...routes.values()].flatMap((route) =>
        polyline(route.d).map((point) => point.x),
      ),
    );

    expect(brackets).toHaveLength(28);
    expect(furthest).toBeLessThanOrEqual(NODE_W + 16 + 40);
  });

  it("draws a two-way line left to right whichever way it was listed", () => {
    const { d } = route(pair, [{ from: "b", to: "a", twoWay: true }], "b>a");

    expect(d.startsWith(`M ${NODE_W + 4} `)).toBe(true);
  });
});

describe("placeNew", () => {
  const statuses = [
    { id: "a", category: "todo" },
    { id: "b", category: "done" },
    { id: "c", category: "done" },
  ];
  const layout = {
    a: { x: 0, y: 0 },
    b: { x: 500, y: 0 },
    c: { x: 500, y: 100 },
  };

  it("puts a new status under the others of its category", () => {
    const at = placeNew(layout, statuses, "done", { x: 0, y: 0 });

    expect(at.x).toBe(500);
    expect(at.y).toBeGreaterThan(100);
  });

  it("falls back to the auto layout's spot for the first of its category", () => {
    expect(placeNew(layout, statuses, "in_review", { x: 250, y: 400 })).toEqual(
      { x: 250, y: 400 },
    );
  });
});

describe("freeSpot", () => {
  it("keeps the preferred spot when nothing is there", () => {
    expect(freeSpot({ a: { x: 0, y: 0 } }, { x: 500, y: 0 })).toEqual({
      x: 500,
      y: 0,
    });
  });

  it("moves down past the nodes already there", () => {
    const spot = freeSpot({ a: { x: 0, y: 0 } }, { x: 10, y: 10 });

    expect(spot.y).toBeGreaterThanOrEqual(NODE_H);
  });
});

describe("revealed", () => {
  const viewport = { width: 800, height: 600 };
  const view = { zoom: 1, x: 0, y: 0 };

  it("leaves the view alone when the node is already visible", () => {
    expect(revealed(view, { x: 100, y: 100 }, viewport)).toBe(view);
  });

  it("pans just far enough to bring a node past the edge into view", () => {
    const next = revealed(view, { x: 900, y: 100 }, viewport);

    expect(900 + NODE_W + next.x).toBeLessThanOrEqual(viewport.width);
    expect(next.y).toBe(0);
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
    const layout = autoLayout(
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
