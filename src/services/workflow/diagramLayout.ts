export const NODE_W = 140;
export const NODE_H = 36;

const STAGES = ["todo", "in_progress", "in_review", "done"];
const COLUMN_GAP = 230;
const ROW_GAP = 76;
const MARGIN = 32;
const ARROW_GAP = 3;

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

// Where each status starts on the canvas: one column per stage, left to right,
// in the order the statuses arrive. Positions are only ever a view of the
// workflow, so nothing here is published.
export function defaultLayout(
  statuses: readonly { id: string; category: string }[],
): Record<string, Point> {
  const rows = new Map<number, number>();
  const layout: Record<string, Point> = {};

  for (const status of statuses) {
    const stage = Math.max(0, STAGES.indexOf(status.category));
    const row = rows.get(stage) ?? 0;

    rows.set(stage, row + 1);
    layout[status.id] = {
      x: MARGIN + stage * COLUMN_GAP,
      y: MARGIN + row * ROW_GAP,
    };
  }

  return layout;
}

// The line between two nodes, clipped to their borders so an arrowhead lands on
// the edge of the target instead of under it. `offset` slides the line sideways,
// which is what keeps A -> B and B -> A from drawing on top of each other.
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

export function canvasSize(layout: Record<string, Point>): {
  width: number;
  height: number;
} {
  const points = Object.values(layout);

  return {
    width: Math.max(760, ...points.map((p) => p.x + NODE_W + MARGIN)),
    height: Math.max(360, ...points.map((p) => p.y + NODE_H + MARGIN)),
  };
}
