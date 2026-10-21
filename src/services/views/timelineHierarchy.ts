import { childrenOf, epicsOf } from "@/services/todos/subtasks";
import type { Sprint, Todo } from "@/types/data";
import { toCalendarDay } from "@/utils/dueDate";
import { addDays } from "./calendar";
import { placeItem, placeItems, type TimelineScale } from "./timeline";
import {
  NO_LIMITS,
  daysBetween,
  type DayBounds,
  type DayRange,
  type DragLimits,
  type DragMode,
} from "./timelineDrag";

// Epic → Task → Subtask rows for the timeline. Sprints are a flat band above
// them, context rather than a level: a Sprint never lends its dates to the work
// planned into it.
//
// Where a row's range comes from, in order:
//   explicit — both of its own dates
//   point    — one of its own dates
//   derived  — no dates of its own, so the span of its children's
//   auto     — none of that either, so an even share of its parent's range,
//              computed on every render and stored nowhere. Dragging it writes
//              real dates, and from then on it is explicit. That null-means-auto
//              rule is what keeps a manual date from ever being re-flowed.
//   none     — nothing to go on: a "No dates" row
export type DateSource = "explicit" | "point" | "derived" | "auto" | "none";

export interface TimelineNode {
  todo: Todo;
  depth: number;
  range: DayRange | null;
  source: DateSource;
  limits: DragLimits;
  // its own dates fall outside the dates its parent set
  outside: boolean;
  children: TimelineNode[];
}

export interface SprintTimelineItem {
  sprint: Sprint;
  start: string;
  end: string;
}

export interface TimelineHierarchy {
  sprints: SprintTimelineItem[];
  epics: TimelineNode[];
}

function ownDates(todo: Todo): DayBounds {
  const start = todo.start_date ? toCalendarDay(todo.start_date) : null;
  const end = todo.due_date ? toCalendarDay(todo.due_date) : null;

  // todos_date_range_check forbids this; a row from before the check could still hold it
  if (start !== null && end !== null && start > end) {
    return { start: end, end: start };
  }

  return { start, end };
}

function span(ranges: DayRange[]): DayRange | null {
  if (ranges.length === 0) return null;

  let { start, end } = ranges[0];

  for (const range of ranges) {
    if (range.start < start) start = range.start;
    if (range.end > end) end = range.end;
  }

  return { start, end };
}

// 12 days over 4 children is 3 days each, in order; a remainder goes to the
// later slots. More children than days share days rather than spilling out.
export function autoSlots(range: DayRange, count: number): DayRange[] {
  const days = daysBetween(range.start, range.end) + 1;

  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const from = Math.floor((i * days) / count);
    const to = Math.max(from, Math.floor(((i + 1) * days) / count) - 1);

    return { start: addDays(range.start, from), end: addDays(range.start, to) };
  });
}

function grow(
  todo: Todo,
  depth: number,
  kidsOf: (todo: Todo, depth: number) => Todo[],
): TimelineNode {
  const children = kidsOf(todo, depth).map((child) =>
    grow(child, depth + 1, kidsOf),
  );
  const own = ownDates(todo);
  const only = own.start ?? own.end;

  const node: TimelineNode = {
    todo,
    depth,
    range: null,
    source: "none",
    limits: NO_LIMITS,
    outside: false,
    children,
  };

  if (own.start !== null && own.end !== null) {
    node.range = { start: own.start, end: own.end };
    node.source = "explicit";
  } else if (only !== null) {
    node.range = { start: only, end: only };
    node.source = "point";
  } else {
    node.range = span(
      children.flatMap((child) => (child.range ? [child.range] : [])),
    );
    node.source = node.range ? "derived" : "none";
  }

  return node;
}

function settle(node: TimelineNode, bounds: DayBounds): void {
  if (node.range) {
    const waiting = node.children.filter((child) => child.source === "none");

    autoSlots(node.range, waiting.length).forEach((slot, i) => {
      waiting[i].range = slot;
      waiting[i].source = "auto";
    });
  }

  const own = ownDates(node.todo);
  const inner: DayBounds = {
    start: own.start ?? bounds.start,
    end: own.end ?? bounds.end,
  };

  for (const child of node.children) settle(child, inner);

  const dated = node.source === "explicit" || node.source === "point";

  node.outside =
    dated &&
    node.range !== null &&
    ((bounds.start !== null && node.range.start < bounds.start) ||
      (bounds.end !== null && node.range.end > bounds.end));

  node.limits = {
    bounds,
    contain: span(
      node.children.flatMap((child) =>
        child.range && child.source !== "auto" && !child.outside
          ? [child.range]
          : [],
      ),
    ),
  };
}

function sprintTimelineItems(sprints: Sprint[]): SprintTimelineItem[] {
  const items: SprintTimelineItem[] = [];

  for (const sprint of sprints) {
    if (!sprint.start_date || !sprint.end_date) continue;

    const start = toCalendarDay(sprint.start_date);
    const end = toCalendarDay(sprint.end_date);

    items.push(
      start <= end
        ? { sprint, start, end }
        : { sprint, start: end, end: start },
    );
  }

  return items.sort((a, b) =>
    a.start < b.start
      ? -1
      : a.start > b.start
        ? 1
        : a.sprint.id.localeCompare(b.sprint.id),
  );
}

// todos: the filtered, top-level rows the view pipeline hands every view.
// subtasks: genuine Subtasks by parent, unfiltered — the pipeline drops them, and
// the List files them back under their parent the same way.
export function buildTimelineHierarchy(
  todos: Todo[],
  {
    subtasks = new Map(),
    sprints = [],
  }: { subtasks?: Map<string, Todo[]>; sprints?: Sprint[] } = {},
): TimelineHierarchy {
  const kidsOf = (todo: Todo, depth: number): Todo[] =>
    depth === 0
      ? childrenOf(todos, todo.id)
      : depth === 1
        ? (subtasks.get(todo.id) ?? [])
        : [];

  const epics = epicsOf(todos).map((epic) => grow(epic, 0, kidsOf));

  for (const epic of epics) settle(epic, NO_LIMITS.bounds);

  return { sprints: sprintTimelineItems(sprints), epics };
}

export function walkTimeline(
  nodes: TimelineNode[],
  visit: (node: TimelineNode) => void,
): void {
  for (const node of nodes) {
    visit(node);
    walkTimeline(node.children, visit);
  }
}

export function descendantsOf(node: TimelineNode): TimelineNode[] {
  const all: TimelineNode[] = [];

  walkTimeline(node.children, (child) => all.push(child));

  return all;
}

// Rows in display order; a collapsed row hides its whole branch.
export function flattenTimeline(
  nodes: TimelineNode[],
  isOpen: (node: TimelineNode) => boolean,
): TimelineNode[] {
  const rows: TimelineNode[] = [];

  const visit = (list: TimelineNode[]) => {
    for (const node of list) {
      rows.push(node);

      if (node.children.length > 0 && isOpen(node)) visit(node.children);
    }
  };

  visit(nodes);

  return rows;
}

export function timelineCounts(
  epics: TimelineNode[],
  ticks: string[],
  scale: TimelineScale,
): { undated: number; offWindow: number } {
  let undated = 0;
  let offWindow = 0;

  walkTimeline(epics, (node) => {
    if (node.range === null) undated += 1;
    else if (placeItem(node.range, ticks, scale) === null) offWindow += 1;
  });

  return { undated, offWindow };
}

export interface DatePatch {
  id: string;
  board_id: string;
  start?: string | null;
  end?: string | null;
}

function patchOf(
  todo: Todo,
  start: string | null,
  end: string | null,
): DatePatch | null {
  const own = ownDates(todo);
  const patch: DatePatch = { id: todo.id, board_id: todo.board_id };

  if (start !== own.start) patch.start = start;
  if (end !== own.end) patch.end = end;

  return "start" in patch || "end" in patch ? patch : null;
}

// What one finished gesture writes. A move carries the row's whole branch with
// it, so moving an Epic two weeks moves its dated Tasks two weeks rather than
// leaving them stranded outside it; auto rows follow by themselves.
export function schedulePatches(
  node: TimelineNode,
  base: DayRange | null,
  range: DayRange,
  mode: DragMode | "draw",
): DatePatch[] {
  const { todo, source } = node;
  const own = ownDates(todo);
  const patches: (DatePatch | null)[] = [];

  if (mode === "draw") {
    patches.push(patchOf(todo, range.start, range.end));
  } else if (source === "point" && mode === "move") {
    patches.push(
      patchOf(
        todo,
        own.start === null ? null : range.start,
        own.end === null ? null : range.end,
      ),
    );
  } else if (!(source === "derived" && mode === "move")) {
    patches.push(patchOf(todo, range.start, range.end));
  }

  const delta =
    mode === "move" && base ? daysBetween(base.start, range.start) : 0;

  if (delta !== 0) {
    for (const child of descendantsOf(node)) {
      const dates = ownDates(child.todo);

      if (dates.start === null && dates.end === null) continue;

      patches.push(
        patchOf(
          child.todo,
          dates.start && addDays(dates.start, delta),
          dates.end && addDays(dates.end, delta),
        ),
      );
    }
  }

  return patches.filter((patch): patch is DatePatch => patch !== null);
}

export function branchIds(node: TimelineNode): Set<string> {
  return new Set(descendantsOf(node).map((child) => child.todo.id));
}

type Placement = NonNullable<ReturnType<typeof placeItem>>;

// lane exists because the Sprints band is one row, not one per sprint — overlapping sprints stack onto a lane below.
export interface PlacedSprint {
  item: SprintTimelineItem;
  place: Placement;
  lane: number;
  angledStart: boolean;
  angledEnd: boolean;
}

function packSprintLanes(
  placed: { item: SprintTimelineItem; place: Placement }[],
): PlacedSprint[] {
  const laneEnds: number[] = [];
  const laneLast: (PlacedSprint | undefined)[] = [];

  const out: PlacedSprint[] = [];

  for (const { item, place } of placed) {
    let lane = laneEnds.findIndex((end) => end <= place.from);

    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }

    const previous = laneLast[lane];
    const abuts = previous !== undefined && laneEnds[lane] === place.from;

    const entry: PlacedSprint = {
      item,
      place,
      lane,
      angledStart: abuts,
      angledEnd: false,
    };

    if (abuts && previous) previous.angledEnd = true;

    laneEnds[lane] = place.to;
    laneLast[lane] = entry;

    out.push(entry);
  }

  return out;
}

export function placeSprints(
  sprints: SprintTimelineItem[],
  ticks: string[],
  scale: TimelineScale,
): PlacedSprint[] {
  return packSprintLanes(placeItems(sprints, ticks, scale));
}
