import { childrenOf, epicsOf, isEpic } from "@/services/todos/subtasks";
import type { Sprint, Todo } from "@/types/data";
import { toCalendarDay } from "@/utils/dueDate";
import {
  placeItem,
  placeItems,
  timelineItems,
  unscheduledTodos,
  type TimelineItem,
  type TimelineScale,
} from "./timeline";

// Epic groups + Sprint bars for the timeline. Sprints are a flat row group, not a third hierarchy level under Epics.
// A Task with no Epic parent doesn't show up here at all — this view is the Epic breakdown, not every Task with a date.

function boundSprint(
  todo: Pick<Todo, "sprint_id">,
  sprintById: Map<string, Sprint>,
): Sprint | null {
  if (todo.sprint_id === null) return null;

  const sprint = sprintById.get(todo.sprint_id);

  if (!sprint || !sprint.start_date || !sprint.end_date) return null;

  return sprint;
}

export interface SprintTimelineItem {
  sprint: Sprint;
  start: string;
  end: string;
}

function sprintTimelineItems(sprints: Sprint[]): SprintTimelineItem[] {
  const items: SprintTimelineItem[] = [];

  for (const sprint of sprints) {
    if (!sprint.start_date || !sprint.end_date) continue;

    const start = toCalendarDay(sprint.start_date);
    const end = toCalendarDay(sprint.end_date);

    items.push(
      start <= end ? { sprint, start, end } : { sprint, start: end, end: start },
    );
  }

  return items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.sprint.id.localeCompare(b.sprint.id)));
}

export interface EpicGroup {
  epic: Todo;
  item: TimelineItem | null;
  isDerived: boolean;
  tasks: { item: TimelineItem; sprintBound: boolean }[];
  taskCount: number;
}

export interface TimelineHierarchy {
  sprints: SprintTimelineItem[];
  epics: EpicGroup[];
}

function rollUp(tasks: TimelineItem[]): { start: string; end: string } {
  let start = tasks[0].start;
  let end = tasks[0].end;

  for (const task of tasks) {
    if (task.start < start) start = task.start;
    if (task.end > end) end = task.end;
  }

  return { start, end };
}

function epicItem(
  epic: Todo,
  tasks: TimelineItem[],
): { item: TimelineItem | null; isDerived: boolean } {
  const [own] = timelineItems([epic]);

  if (own) return { item: own, isDerived: false };

  if (tasks.length === 0) return { item: null, isDerived: false };

  const { start, end } = rollUp(tasks);

  return { item: { todo: epic, start, end, isPoint: false }, isDerived: true };
}

export function buildTimelineHierarchy(
  todos: Todo[],
  sprints: Sprint[] = [],
): TimelineHierarchy {
  const epics = epicsOf(todos);
  const sprintById = new Map(sprints.map((sprint) => [sprint.id, sprint]));

  const groups: EpicGroup[] = epics.map((epic) => {
    const children = childrenOf(todos, epic.id);

    // clamp a sprint-bound task's placement to its sprint's range, on a copy — never touch the stored row
    const boundIds = new Set<string>();

    const forPlacement = children.map((child) => {
      const sprint = boundSprint(child, sprintById);

      if (!sprint) return child;

      boundIds.add(child.id);

      return { ...child, start_date: sprint.start_date, due_date: sprint.end_date };
    });

    const tasks = timelineItems(forPlacement).map((item) => ({
      item,
      sprintBound: boundIds.has(item.todo.id),
    }));

    const { item, isDerived } = epicItem(
      epic,
      tasks.map(({ item }) => item),
    );

    return { epic, item, isDerived, tasks, taskCount: children.length };
  });

  return { sprints: sprintTimelineItems(sprints), epics: groups };
}

export function countHierarchyItems(hierarchy: TimelineHierarchy): number {
  return hierarchy.epics.reduce(
    (sum, group) => sum + (group.item ? 1 : 0) + group.tasks.length,
    0,
  );
}

type Placement = NonNullable<ReturnType<typeof placeItem>>;

export interface PlacedEpicGroup {
  group: EpicGroup;
  place: Placement | null;
  tasks: { item: TimelineItem; place: Placement; sprintBound: boolean }[];
}

// lane exists because the Sprints band is one row, not one per sprint — overlapping sprints stack onto a lane below.
export interface PlacedSprint {
  item: SprintTimelineItem;
  place: Placement;
  lane: number;
  angledStart: boolean;
  angledEnd: boolean;
}

export interface PlacedTimelineHierarchy {
  sprints: PlacedSprint[];
  epics: PlacedEpicGroup[];
}

function packSprintLanes(
  placed: { item: SprintTimelineItem; place: Placement }[],
): PlacedSprint[] {
  const laneEnds: number[] = [];
  const laneLast: (PlacedSprint | undefined)[] = [];

  const out: PlacedSprint[] = [];

  for (const { item, place } of placed) {
    let lane = laneEnds.findIndex((end) => end <= place.index);

    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }

    const previous = laneLast[lane];
    const abuts = previous !== undefined && laneEnds[lane] === place.index;

    const entry: PlacedSprint = {
      item,
      place,
      lane,
      angledStart: abuts,
      angledEnd: false,
    };

    if (abuts && previous) previous.angledEnd = true;

    laneEnds[lane] = place.index + place.span;
    laneLast[lane] = entry;

    out.push(entry);
  }

  return out;
}

export function placeTimelineHierarchy(
  hierarchy: TimelineHierarchy,
  ticks: string[],
  scale: TimelineScale,
): PlacedTimelineHierarchy {
  const epics = hierarchy.epics
    .map((group) => {
      const place = group.item ? placeItem(group.item, ticks, scale) : null;

      const tasks = group.tasks
        .map(({ item, sprintBound }) => {
          const place = placeItem(item, ticks, scale);

          return place ? { item, place, sprintBound } : null;
        })
        .filter((placed): placed is NonNullable<typeof placed> => placed !== null);

      return { group, place, tasks };
    })
    // an epic group survives off-window as long as it has no dates at all — dropping it would orphan its on-window tasks under no header
    .filter(
      (placed) =>
        placed.group.item === null ||
        placed.place !== null ||
        placed.tasks.length > 0,
    );

  const sprints = packSprintLanes(placeItems(hierarchy.sprints, ticks, scale));

  return { sprints, epics };
}

export function countPlacedHierarchyItems(placed: PlacedTimelineHierarchy) {
  return placed.epics.reduce(
    (sum, group) => sum + (group.place ? 1 : 0) + group.tasks.length,
    0,
  );
}

export function undatedTimelineTodos(
  todos: Todo[],
  sprints: Sprint[] = [],
): Todo[] {
  const sprintById = new Map(sprints.map((sprint) => [sprint.id, sprint]));

  return unscheduledTodos(todos).filter(
    (todo) =>
      !isEpic(todo) &&
      todo.parent_id !== null &&
      !boundSprint(todo, sprintById),
  );
}
