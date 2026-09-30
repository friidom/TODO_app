export const NODE_W = 184;
export const NODE_H = 52;

const STAGES = ["todo", "in_progress", "in_review", "done"];
const ROW_GAP = NODE_H + 40;
const MARGIN = 48;
const ARROW_GAP = 4;
const CORNER = 8;
const PORT_PAD = 8;
const TRACK_GAP = 12;
const MIN_CHANNEL = 96;
const MAX_CHANNEL = 260;
const LANE_GAP = 28;
const LANE_STEP = 14;
const BRACKET_GAP = 16;
const BRACKET_STEP = 10;
// Brackets stay in the near half of the gap, however many there are.
const BRACKET_SPREAD = 40;
const ORDER_SWEEPS = 4;
// Below this, "every other status" is one or two arrows and a badge saves nothing.
const ANY_MIN_STATUSES = 4;

export const MIN_ZOOM = 0.3;
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

interface Edge {
  from: string;
  to: string;
}

export interface DisplayEdge extends Edge {
  // Drawn once with an arrowhead at each end: both from -> to and to -> from exist.
  twoWay: boolean;
}

export interface Route {
  d: string;
  mid: Point;
  // A two-way line drawn from its `to` end, to keep it left to right.
  reversed: boolean;
}

export function edgeKey(from: string, to: string): string {
  return `${from}>${to}`;
}

// What the canvas draws for a set of transitions. Two compressions, both only
// presentation — the transitions themselves are untouched:
// - a status every other status can move to is an "any" target, shown as a
//   badge on the node instead of an arrow from each of them;
// - a pair that points both ways is one line with two arrowheads.
// The default edge set allows every backward move, so without these a workflow
// of twenty statuses is three hundred arrows.
export function displayEdges(
  statusIds: readonly string[],
  transitions: readonly Edge[],
): { edges: DisplayEdge[]; anyTargets: Set<string> } {
  const present = new Set(statusIds);
  const valid = transitions.filter(
    (edge) =>
      edge.from !== edge.to && present.has(edge.from) && present.has(edge.to),
  );

  const sources = new Map<string, Set<string>>();

  for (const edge of valid) {
    const into = sources.get(edge.to) ?? new Set();

    into.add(edge.from);
    sources.set(edge.to, into);
  }

  const anyTargets = new Set(
    statusIds.length >= ANY_MIN_STATUSES
      ? statusIds.filter(
          (id) => (sources.get(id)?.size ?? 0) === statusIds.length - 1,
        )
      : [],
  );

  const drawn = valid.filter((edge) => !anyTargets.has(edge.to));
  const keys = new Set(drawn.map((edge) => edgeKey(edge.from, edge.to)));
  const order = new Map(statusIds.map((id, index) => [id, index]));
  const handled = new Set<string>();
  const edges: DisplayEdge[] = [];

  for (const edge of drawn) {
    if (handled.has(edgeKey(edge.from, edge.to))) continue;

    const twoWay = keys.has(edgeKey(edge.to, edge.from));

    handled.add(edgeKey(edge.from, edge.to));
    handled.add(edgeKey(edge.to, edge.from));

    if (twoWay && order.get(edge.to)! < order.get(edge.from)!) {
      edges.push({ from: edge.to, to: edge.from, twoWay });
    } else {
      edges.push({ from: edge.from, to: edge.to, twoWay });
    }
  }

  return { edges, anyTargets };
}

// Whether a transition is the one a drawn line stands for — a two-way line
// stands for both directions.
export function drawnAs(edge: DisplayEdge, from: string, to: string): boolean {
  return (
    (edge.from === from && edge.to === to) ||
    (edge.twoWay && edge.from === to && edge.to === from)
  );
}

function stageOf(category: string): number {
  return Math.max(0, STAGES.indexOf(category));
}

// Positions only ever describe the view, so nothing here is published.
//
// One column per stage that has a status, left to right in lifecycle order.
// Inside a column, statuses start in board order and are then reordered by the
// barycentre of their neighbours in the next column, which is what untangles a
// hand-built workflow; where every status connects to every other the averages
// tie and board order stands. Each gap between columns is widened by the lines
// that have to run through it.
export function autoLayout(
  statuses: readonly { id: string; category: string }[],
  edges: readonly Edge[] = [],
): Record<string, Point> {
  const byStage = new Map<number, string[]>();

  for (const status of statuses) {
    const stage = stageOf(status.category);

    byStage.set(stage, [...(byStage.get(stage) ?? []), status.id]);
  }

  const layers = orderLayers(
    [...byStage.entries()].sort(([a], [b]) => a - b).map(([, ids]) => ids),
    edges,
  );

  const layerOf = new Map<string, number>();

  layers.forEach((ids, index) => ids.forEach((id) => layerOf.set(id, index)));

  const load = layers.map(() => 0);

  for (const edge of edges) {
    const a = layerOf.get(edge.from);
    const b = layerOf.get(edge.to);

    if (a === undefined || b === undefined) continue;

    if (Math.abs(a - b) === 1) load[Math.min(a, b)]!++;
    else if (a === b) load[a]!++;
  }

  const tallest = Math.max(1, ...layers.map((ids) => ids.length));
  const layout: Record<string, Point> = {};
  let x = MARGIN;

  layers.forEach((ids, index) => {
    const offset = ((tallest - ids.length) * ROW_GAP) / 2;

    ids.forEach((id, row) => {
      layout[id] = { x, y: MARGIN + offset + row * ROW_GAP };
    });

    x +=
      NODE_W +
      Math.min(
        MAX_CHANNEL,
        Math.max(MIN_CHANNEL, 48 + (load[index] ?? 0) * TRACK_GAP),
      );
  });

  return layout;
}

function orderLayers(layers: string[][], edges: readonly Edge[]): string[][] {
  const neighbours = new Map<string, string[]>();

  for (const edge of edges) {
    neighbours.set(edge.from, [...(neighbours.get(edge.from) ?? []), edge.to]);
    neighbours.set(edge.to, [...(neighbours.get(edge.to) ?? []), edge.from]);
  }

  const result = layers.map((ids) => [...ids]);

  for (let sweep = 0; sweep < ORDER_SWEEPS; sweep++) {
    const down = sweep % 2 === 0;
    const indices = result.map((_, index) => index);
    const visit = down ? indices.slice(1) : indices.slice(0, -1).reverse();

    for (const index of visit) {
      const reference = result[down ? index - 1 : index + 1]!;
      const at = new Map(
        reference.map((id, row) => [id, (row + 0.5) / reference.length]),
      );
      const current = result[index]!;

      result[index] = current
        .map((id, row) => {
          const linked = (neighbours.get(id) ?? [])
            .map((other) => at.get(other))
            .filter((value) => value !== undefined);
          const score = linked.length
            ? linked.reduce((sum, value) => sum + value, 0) / linked.length
            : (row + 0.5) / current.length;

          return { id, row, score };
        })
        .sort((a, b) => a.score - b.score || a.row - b.row)
        .map((item) => item.id);
    }
  }

  return result;
}

interface Box {
  x: number;
  y: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

function boxAt(point: Point): Box {
  return {
    x: point.x,
    y: point.y,
    right: point.x + NODE_W,
    bottom: point.y + NODE_H,
    cx: point.x + NODE_W / 2,
    cy: point.y + NODE_H / 2,
  };
}

type Side = "left" | "right" | "top" | "bottom";
type Kind = "channel" | "above" | "below" | "bracket";

interface Plan {
  key: string;
  reversed: boolean;
  from: string;
  to: string;
  twoWay: boolean;
  kind: Kind;
  corridor: [number, number] | null;
  fromSide: Side;
  toSide: Side;
  start: Point;
  end: Point;
}

const SIDES: Record<Kind, [Side, Side]> = {
  channel: ["right", "left"],
  above: ["top", "top"],
  below: ["bottom", "bottom"],
  bracket: ["right", "right"],
};

// Orthogonal routing for every drawn line at once, because readable routes
// depend on each other:
// - a line to the next column runs through the gap between them, each on a
//   track of its own, ordered so lines in one gap do not cross;
// - a forward line that would cut through a node goes over the top, and a
//   backward one always loops underneath, so left to right stays "progress";
// - two statuses stacked in one column are joined by a bracket beside them;
// - where several lines meet one side of a node their ends are spread along
//   it, so arrowheads do not pile onto one point.
export function routeEdges(
  layout: Record<string, Point>,
  edges: readonly DisplayEdge[],
): Map<string, Route> {
  const boxes = new Map(
    Object.entries(layout).map(([id, point]) => [id, boxAt(point)]),
  );

  const plans: Plan[] = [];

  for (const edge of edges) {
    const source = boxes.get(edge.from);
    const target = boxes.get(edge.to);

    if (!source || !target) continue;

    // A two-way line has no direction to keep, so it is drawn left to right.
    const flip = edge.twoWay && target.right + 2 * CORNER <= source.x;
    const [from, to] = flip ? [edge.to, edge.from] : [edge.from, edge.to];
    const a = boxes.get(from)!;
    const b = boxes.get(to)!;

    let kind: Kind = "bracket";
    let corridor: [number, number] | null = null;

    if (b.x >= a.right + 2 * CORNER) {
      corridor = freeCorridor(a, b, boxes, from, to);
      kind = corridor ? "channel" : "above";
    } else if (b.right + 2 * CORNER <= a.x) {
      kind = "below";
    }

    const [fromSide, toSide] = SIDES[kind];

    plans.push({
      key: edgeKey(edge.from, edge.to),
      reversed: flip,
      from,
      to,
      twoWay: edge.twoWay,
      kind,
      corridor,
      fromSide,
      toSide,
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
    });
  }

  assignPorts(plans, boxes);

  const routes = new Map<string, Route>();
  const points = new Map<Plan, Point[]>();

  for (const [plan, route] of channelRoutes(plans)) points.set(plan, route);
  for (const [plan, route] of bracketRoutes(plans, boxes)) {
    points.set(plan, route);
  }
  for (const [plan, route] of laneRoutes(plans, boxes)) points.set(plan, route);

  for (const [plan, route] of points) {
    routes.set(plan.key, {
      d: roundedPath(route),
      mid: midpointOf(route),
      reversed: plan.reversed,
    });
  }

  return routes;
}

// The stretch of the gap between two nodes a vertical run can use without a
// horizontal run crossing another node, nearest the target first; null when
// every stretch is blocked and the line has to go around.
function freeCorridor(
  a: Box,
  b: Box,
  boxes: ReadonlyMap<string, Box>,
  fromId: string,
  toId: string,
): [number, number] | null {
  const lo = a.right;
  const hi = b.x;
  const blockers = [...boxes.entries()]
    .filter(
      ([id, box]) =>
        id !== fromId && id !== toId && box.right > lo && box.x < hi,
    )
    .map(([, box]) => box);

  if (blockers.length === 0) return [lo, hi];

  const covered = blockers
    .map((box) => [Math.max(lo, box.x), Math.min(hi, box.right)] as const)
    .sort((p, q) => p[0] - q[0]);

  const free: [number, number][] = [];
  let cursor = lo;

  for (const [start, end] of covered) {
    if (start > cursor) free.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }

  if (cursor < hi) free.push([cursor, hi]);

  const overlapsRow = (box: Box, row: Box) =>
    box.y < row.bottom && box.bottom > row.y;

  for (const [start, end] of free.reverse()) {
    if (end - start < 2 * CORNER + 4) continue;

    const leftClear = blockers.every(
      (box) => box.right > start || !overlapsRow(box, a),
    );
    const rightClear = blockers.every(
      (box) => box.x < end || !overlapsRow(box, b),
    );

    if (leftClear && rightClear) return [start, end];
  }

  return null;
}

function assignPorts(plans: Plan[], boxes: ReadonlyMap<string, Box>) {
  const groups = new Map<
    string,
    { plan: Plan; end: "start" | "end"; other: Box }[]
  >();

  for (const plan of plans) {
    const a = boxes.get(plan.from)!;
    const b = boxes.get(plan.to)!;

    for (const [node, side, end, other] of [
      [plan.from, plan.fromSide, "start", b],
      [plan.to, plan.toSide, "end", a],
    ] as const) {
      const key = `${node}:${side}`;

      groups.set(key, [...(groups.get(key) ?? []), { plan, end, other }]);
    }
  }

  for (const [key, members] of groups) {
    const [node, side] = key.split(":") as [string, Side];
    const box = boxes.get(node)!;
    const vertical = side === "left" || side === "right";

    members.sort((p, q) =>
      vertical ? p.other.cy - q.other.cy : p.other.cx - q.other.cx,
    );

    const span = (vertical ? NODE_H : NODE_W) - 2 * PORT_PAD;

    members.forEach(({ plan, end }, index) => {
      const offset = PORT_PAD + ((index + 0.5) * span) / members.length;
      const headed = end === "end" || plan.twoWay;
      const gap = headed ? ARROW_GAP : 0;
      const point =
        side === "left"
          ? { x: box.x - gap, y: box.y + offset }
          : side === "right"
            ? { x: box.right + gap, y: box.y + offset }
            : side === "top"
              ? { x: box.x + offset, y: box.y - gap }
              : { x: box.x + offset, y: box.bottom + gap };

      plan[end] = point;
    });
  }
}

// Ordered so that lines sharing a gap do not cross: of two lines heading down,
// the one that starts higher takes the track further along, and the reverse for
// lines heading up.
function channelRoutes(plans: Plan[]): Map<Plan, Point[]> {
  const byCorridor = new Map<string, Plan[]>();
  const routes = new Map<Plan, Point[]>();

  for (const plan of plans) {
    if (plan.kind !== "channel" || !plan.corridor) continue;

    if (Math.abs(plan.start.y - plan.end.y) < 1) {
      routes.set(plan, [plan.start, plan.end]);
      continue;
    }

    const key = plan.corridor.map(Math.round).join(":");

    byCorridor.set(key, [...(byCorridor.get(key) ?? []), plan]);
  }

  for (const group of byCorridor.values()) {
    const down = (plan: Plan) => plan.end.y > plan.start.y;

    group.sort((p, q) => {
      if (down(p) !== down(q)) return down(p) ? -1 : 1;

      return down(p) ? q.start.y - p.start.y : p.start.y - q.start.y;
    });

    const [lo, hi] = group[0]!.corridor!;

    group.forEach((plan, index) => {
      const x = lo + ((index + 1) * (hi - lo)) / (group.length + 1);

      routes.set(plan, [
        plan.start,
        { x, y: plan.start.y },
        { x, y: plan.end.y },
        plan.end,
      ]);
    });
  }

  return routes;
}

function bracketRoutes(
  plans: Plan[],
  boxes: ReadonlyMap<string, Box>,
): Map<Plan, Point[]> {
  const byColumn = new Map<number, Plan[]>();
  const routes = new Map<Plan, Point[]>();

  for (const plan of plans) {
    if (plan.kind !== "bracket") continue;

    const edge = Math.round(
      Math.max(boxes.get(plan.from)!.right, boxes.get(plan.to)!.right),
    );

    byColumn.set(edge, [...(byColumn.get(edge) ?? []), plan]);
  }

  for (const [edge, group] of byColumn) {
    // shorter brackets inside longer ones, so nested pairs never cross
    group.sort(
      (p, q) => Math.abs(p.end.y - p.start.y) - Math.abs(q.end.y - q.start.y),
    );

    const step = Math.min(BRACKET_STEP, BRACKET_SPREAD / group.length);

    group.forEach((plan, index) => {
      const x = edge + BRACKET_GAP + index * step;

      routes.set(plan, [
        plan.start,
        { x, y: plan.start.y },
        { x, y: plan.end.y },
        plan.end,
      ]);
    });
  }

  return routes;
}

function laneRoutes(
  plans: Plan[],
  boxes: ReadonlyMap<string, Box>,
): Map<Plan, Point[]> {
  const routes = new Map<Plan, Point[]>();

  for (const kind of ["above", "below"] as const) {
    const group = plans
      .filter((plan) => plan.kind === kind)
      .sort(
        (p, q) => Math.abs(p.end.x - p.start.x) - Math.abs(q.end.x - q.start.x),
      );

    group.forEach((plan, index) => {
      const left = Math.min(plan.start.x, plan.end.x);
      const right = Math.max(plan.start.x, plan.end.x);
      const spanned = [...boxes.values()].filter(
        (box) => box.right >= left && box.x <= right,
      );
      const offset = LANE_GAP + index * LANE_STEP;
      const y =
        kind === "above"
          ? Math.min(...spanned.map((box) => box.y)) - offset
          : Math.max(...spanned.map((box) => box.bottom)) + offset;

      routes.set(plan, [
        plan.start,
        { x: plan.start.x, y },
        { x: plan.end.x, y },
        plan.end,
      ]);
    });
  }

  return routes;
}

// The straight line between two nodes, clipped to their borders: what the
// drag-to-connect preview follows, where there is no route to take yet.
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

// `preferred`, or the nearest spot below it that no node overlaps — where a
// new status goes when the reader has already arranged the others.
// Where a new status of `category` goes on a diagram the reader may already
// have arranged: under the others of its category, or where the auto layout
// would put it when it is the first of its kind.
export function placeNew(
  layout: Record<string, Point>,
  statuses: readonly { id: string; category: string }[],
  category: string,
  fallback: Point,
): Point {
  const peers = statuses
    .filter((status) => status.category === category && layout[status.id])
    .map((status) => layout[status.id]!);

  if (peers.length === 0) return freeSpot(layout, fallback);

  const x = peers[peers.length - 1]!.x;
  const y = Math.max(...peers.map((peer) => peer.y)) + ROW_GAP;

  return freeSpot(layout, { x, y });
}

export function freeSpot(
  layout: Record<string, Point>,
  preferred: Point,
): Point {
  const taken = Object.values(layout);
  const clear = (at: Point) =>
    taken.every(
      (other) =>
        Math.abs(other.x - at.x) >= NODE_W + CORNER ||
        Math.abs(other.y - at.y) >= NODE_H + CORNER,
    );

  for (let step = 0; step < 200; step++) {
    const at = { x: preferred.x, y: preferred.y + step * ROW_GAP };

    if (clear(at)) return at;
  }

  return preferred;
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

// The smallest pan that brings a node fully into view, or the view unchanged
// when it is already there — what selecting from the inspector does.
export function revealed(
  view: Viewport,
  at: Point,
  viewport: { width: number; height: number },
): Viewport {
  const pad = 24;
  const left = at.x * view.zoom + view.x;
  const top = at.y * view.zoom + view.y;
  const right = left + NODE_W * view.zoom;
  const bottom = top + NODE_H * view.zoom;

  const dx =
    left < pad
      ? pad - left
      : right > viewport.width - pad
        ? viewport.width - pad - right
        : 0;
  const dy =
    top < pad
      ? pad - top
      : bottom > viewport.height - pad
        ? viewport.height - pad - bottom
        : 0;

  return dx === 0 && dy === 0
    ? view
    : { ...view, x: view.x + dx, y: view.y + dy };
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
