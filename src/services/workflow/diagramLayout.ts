export const NODE_W = 176;
export const NODE_H = 48;

const STAGES = ["todo", "in_progress", "in_review", "done"];
const COLUMN_GAP = 268;
const ROW_GAP = 88;
const MARGIN = 48;
const ARROW_GAP = 4;
const CORNER = 10;
// How far beneath the nodes a backward edge runs before it turns back.
const BACK_LANE = 36;

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2;

export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  zoom: number;
  x: number;
  y: number;
}

// Where each status starts on the canvas: one column per stage, left to right,
// stacked inside it, each column centred against the tallest. Positions are only
// ever a view of the workflow, so nothing here is published.
export function defaultLayout(
  statuses: readonly { id: string; category: string }[],
): Record<string, Point> {
  const byStage = new Map<number, string[]>();

  for (const status of statuses) {
    const stage = Math.max(0, STAGES.indexOf(status.category));
    const ids = byStage.get(stage) ?? [];

    ids.push(status.id);
    byStage.set(stage, ids);
  }

  const tallest = Math.max(
    1,
    ...[...byStage.values()].map((ids) => ids.length),
  );
  const layout: Record<string, Point> = {};

  for (const [stage, ids] of byStage) {
    const offset = ((tallest - ids.length) * ROW_GAP) / 2;

    ids.forEach((id, row) => {
      layout[id] = {
        x: MARGIN + stage * COLUMN_GAP,
        y: MARGIN + offset + row * ROW_GAP,
      };
    });
  }

  return layout;
}

// The straight line between two nodes, clipped to their borders. Still the
// geometry the drag-to-connect preview follows, where there is no target box to
// route around yet.
export function edgeSegment(from: Point, to: Point, offset = 0): Segment {
  const ax = from.x + NODE_W / 2;
  const ay = from.y + NODE_H / 2;
  const bx = to.x + NODE_W / 2;
  const by = to.y + NODE_H / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const exit = Math.min(
    ux === 0 ? Infinity : NODE_W / 2 / Math.abs(ux),
    uy === 0 ? Infinity : NODE_H / 2 / Math.abs(uy),
  );
  const nx = -uy * offset;
  const ny = ux * offset;

  return {
    x1: ax + ux * exit + nx,
    y1: ay + uy * exit + ny,
    x2: bx - ux * (exit + ARROW_GAP) + nx,
    y2: by - uy * (exit + ARROW_GAP) + ny,
  };
}

// Orthogonal routing, which is what keeps a dense workflow readable: an edge
// leaves and enters a node square-on, so arrows meet borders at right angles
// instead of cutting diagonally across neighbouring nodes. `lane` separates
// edges that would otherwise share a run.
export function edgePath(
  from: Point,
  to: Point,
  lane = 0,
): { d: string; mid: Point } {
  const points = routePoints(from, to, lane);

  return { d: roundedPath(points), mid: midpointOf(points) };
}

function routePoints(from: Point, to: Point, lane: number): Point[] {
  const a = {
    right: from.x + NODE_W,
    bottom: from.y + NODE_H,
    cx: from.x + NODE_W / 2,
    cy: from.y + NODE_H / 2,
  };
  const b = {
    left: to.x,
    top: to.y,
    bottom: to.y + NODE_H,
    cx: to.x + NODE_W / 2,
    cy: to.y + NODE_H / 2,
  };

  if (b.left >= a.right + 2 * CORNER) {
    const start = { x: a.right, y: a.cy };
    const end = { x: b.left - ARROW_GAP, y: b.cy };

    if (Math.abs(a.cy - b.cy) < 1) return [start, end];

    const mx = (a.right + b.left) / 2 + lane * 14;

    return [start, { x: mx, y: a.cy }, { x: mx, y: b.cy }, end];
  }

  if (b.top >= a.bottom + 2 * CORNER && Math.abs(a.cx - b.cx) < NODE_W) {
    const start = { x: a.cx, y: a.bottom };
    const end = { x: b.cx, y: b.top - ARROW_GAP };

    if (Math.abs(a.cx - b.cx) < 1) return [start, end];

    const my = (a.bottom + b.top) / 2;

    return [start, { x: a.cx, y: my }, { x: b.cx, y: my }, end];
  }

  const depth = Math.max(a.bottom, b.bottom) + BACK_LANE + lane * 16;

  return [
    { x: a.cx, y: a.bottom },
    { x: a.cx, y: depth },
    { x: b.cx, y: depth },
    { x: b.cx, y: b.bottom + ARROW_GAP },
  ];
}

function roundedPath(points: readonly Point[]): string {
  if (points.length < 2) return "";

  let d = `M ${round(points[0]!.x)} ${round(points[0]!.y)}`;

  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i]!;
    const into = towards(corner, points[i - 1]!);
    const out = towards(corner, points[i + 1]!);

    d += ` L ${round(into.x)} ${round(into.y)} Q ${round(corner.x)} ${round(corner.y)} ${round(out.x)} ${round(out.y)}`;
  }

  const last = points[points.length - 1]!;

  return `${d} L ${round(last.x)} ${round(last.y)}`;
}

function towards(corner: Point, neighbour: Point): Point {
  const dx = neighbour.x - corner.x;
  const dy = neighbour.y - corner.y;
  const length = Math.hypot(dx, dy) || 1;
  const step = Math.min(CORNER, length / 2);

  return {
    x: corner.x + (dx / length) * step,
    y: corner.y + (dy / length) * step,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// Half way along the route, which is where the edge's own controls sit.
function midpointOf(points: readonly Point[]): Point {
  const lengths: number[] = [];
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(
      points[i]!.x - points[i - 1]!.x,
      points[i]!.y - points[i - 1]!.y,
    );

    lengths.push(length);
    total += length;
  }

  let walked = 0;

  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;

    if (walked + length >= total / 2) {
      const t = length === 0 ? 0 : (total / 2 - walked) / length;

      return {
        x: points[i]!.x + (points[i + 1]!.x - points[i]!.x) * t,
        y: points[i]!.y + (points[i + 1]!.y - points[i]!.y) * t,
      };
    }

    walked += length;
  }

  return points[0] ?? { x: 0, y: 0 };
}

// The node a point falls inside, if any; used to finish a drag-to-connect.
export function nodeAt(
  layout: Record<string, Point>,
  point: Point,
  except?: string,
): string | null {
  for (const [id, at] of Object.entries(layout)) {
    if (
      id !== except &&
      point.x >= at.x &&
      point.x <= at.x + NODE_W &&
      point.y >= at.y &&
      point.y <= at.y + NODE_H
    ) {
      return id;
    }
  }

  return null;
}

export function contentBounds(layout: Record<string, Point>): Bounds {
  const points = Object.values(layout);

  if (points.length === 0) return { x: 0, y: 0, width: NODE_W, height: NODE_H };

  const x = Math.min(...points.map((point) => point.x));
  const y = Math.min(...points.map((point) => point.y));

  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) + NODE_W - x,
    height: Math.max(...points.map((point) => point.y)) + NODE_H - y,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

// The transform that centres the whole workflow in the viewport. Never zooms
// past 1: a three-status workflow blown up to fill a wide canvas looks broken,
// where the same workflow at its own size with room around it does not.
export function fitView(
  layout: Record<string, Point>,
  viewport: { width: number; height: number },
): Viewport {
  const bounds = contentBounds(layout);
  const zoom = clampZoom(
    Math.min(
      (viewport.width - MARGIN * 2) / bounds.width,
      (viewport.height - MARGIN * 2) / bounds.height,
      1,
    ),
  );

  return {
    zoom,
    x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (viewport.height - bounds.height * zoom) / 2 - bounds.y * zoom,
  };
}

// Zooms about a fixed point of the viewport, so the canvas grows around the
// pointer or the centre rather than sliding out from under it.
export function zoomAt(view: Viewport, zoom: number, focus: Point): Viewport {
  const next = clampZoom(zoom);
  const scale = next / view.zoom;

  return {
    zoom: next,
    x: focus.x - (focus.x - view.x) * scale,
    y: focus.y - (focus.y - view.y) * scale,
  };
}
