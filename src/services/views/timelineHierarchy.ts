import {
  childrenOf,
  epicsOf,
  isEpic,
  isGenuineSubtask,
} from "@/services/todos/subtasks";
import type { Todo } from "@/types/data";
import {
  placeItem,
  placeItems,
  timelineItems,
  unscheduledTodos,
  type TimelineItem,
  type TimelineScale,
} from "./timeline";

/**
 * Epic groups, on top of `timeline.ts`'s flat rows (M28-B).
 *
 * **A second pure module rather than widening `timeline.ts`.** That file's own
 * header names its job precisely — "work items as ranges over time" — and
 * every function in it is one row's placement, independent of any other row.
 * Grouping is a different question: which rows sit *under* which, in what
 * order, and what a group's own bar means when nothing was typed into it
 * directly. Keeping the two apart is what let this milestone leave every
 * existing `timeline.ts` function, and every one of its tests, untouched.
 *
 * **The hierarchy this reads is M28-A's, not a new one.** A Task's `parent_id`
 * pointing at an Epic is what makes it a member of that Epic's group; nothing
 * here stores membership, an order, or a range separately from that column.
 * `useVisibleTodos` has already dropped every genuine Subtask before this
 * module ever sees the array (M27), so a Subtask can never surface as a
 * group's row — there is no case here to exclude one.
 *
 * **An Epic is always shown, dated or not.** That is the one deliberate
 * asymmetry with an ordinary Task: `timelineItems` drops anything with
 * neither date, because there is no honest column to draw it in — but an
 * Epic is a *container* first, and "this Epic has no dates yet" is not the
 * same fact as "this Epic does not exist". So an Epic with nothing to place
 * still gets a row, with no bar to draw underneath it, exactly the way a
 * board still shows an empty column.
 */

/**
 * One Epic's group, before it is placed against a window.
 *
 * `item` is the Epic's own placement — explicit if the Epic carries its own
 * dates, otherwise rolled up from `tasks`, otherwise null when neither
 * resolves. `isDerived` is what tells the renderer which of those two it got,
 * because the two must not be interacted with the same way: an explicit range
 * is the Epic's own stored fact and may be dragged like any other bar: a
 * rolled-up one is a *computed* summary of other rows' facts, and dragging it
 * would have to silently invent Epic dates nobody set.
 */
export interface EpicGroup {
  epic: Todo;
  item: TimelineItem | null;
  isDerived: boolean;
  /** This Epic's own Tasks that have at least one date — what draws as
   * nested rows, already in `timelineItems`' start/end/key order. */
  tasks: TimelineItem[];
  /** Every Task under this Epic, dated or not — what the progress badge
   * counts. Completion is a status question, not a scheduling one. */
  taskCount: number;
}

export interface TimelineHierarchy {
  /** One entry per Epic on the board, in the order `epicsOf` returns them
   * (creation order — the same order `useEpics()` already lists them in). */
  epics: EpicGroup[];
  /** Dated, top-level Tasks — an Epic's own Tasks are never in this list,
   * whether or not their group is expanded. */
  topLevel: TimelineItem[];
}

/**
 * The earliest start and latest end across a group's dated Tasks, as one
 * range — the Epic bar's rolled-up value when it has no dates of its own.
 *
 * A plain reduction, not a second date library: `start`/`end` are
 * `YYYY-MM-DD`, and that format compares correctly as a string, the same
 * property every other comparison in `timeline.ts` relies on.
 */
function rollUp(tasks: TimelineItem[]): { start: string; end: string } {
  let start = tasks[0].start;
  let end = tasks[0].end;

  for (const task of tasks) {
    if (task.start < start) start = task.start;
    if (task.end > end) end = task.end;
  }

  return { start, end };
}

/**
 * One Epic's own row: its explicit dates if it has them, else a rollup of its
 * dated Tasks, else nothing to place at all.
 */
function epicItem(
  epic: Todo,
  tasks: TimelineItem[],
): { item: TimelineItem | null; isDerived: boolean } {
  // Reuses `timelineItems`' own point/range rule for the Epic's OWN two
  // columns — one call, on a one-element array, rather than a second copy of
  // "both dates is a range, one is a point, neither is nothing".
  const [own] = timelineItems([epic]);

  if (own) return { item: own, isDerived: false };

  if (tasks.length === 0) return { item: null, isDerived: false };

  const { start, end } = rollUp(tasks);

  return { item: { todo: epic, start, end, isPoint: false }, isDerived: true };
}

/**
 * The board's work, grouped: every Epic with its own Tasks, and every
 * top-level Task on its own.
 *
 * **Orphan-safe.** A Task whose `parent_id` names an Epic that is not in
 * `todos` — filtered out by search, by the type filter, or simply not (yet)
 * in a transient cache — renders top-level rather than vanishing. The same
 * rule `parentOf` states for a single lookup applies here to a whole list: a
 * gap in what is currently visible must never read as an invalid hierarchy,
 * and a real card must never disappear because the row that would have
 * explained where it sits happens not to be on screen right now.
 */
export function buildTimelineHierarchy(todos: Todo[]): TimelineHierarchy {
  const epics = epicsOf(todos);
  const epicIds = new Set(epics.map((epic) => epic.id));

  const groups: EpicGroup[] = epics.map((epic) => {
    const children = childrenOf(todos, epic.id);
    const tasks = timelineItems(children);
    const { item, isDerived } = epicItem(epic, tasks);

    return { epic, item, isDerived, tasks, taskCount: children.length };
  });

  // `!isGenuineSubtask` is a defensive second gate, not the first line of
  // defence — `useVisibleTodos` has already dropped every genuine Subtask
  // before this array reaches here (M27). It costs one more lookup per row to
  // state the invariant this module also depends on, rather than trusting a
  // caller three files away to have upheld it.
  const topLevelTodos = todos.filter(
    (todo) =>
      !isEpic(todo) &&
      !isGenuineSubtask(todos, todo) &&
      (todo.parent_id === null || !epicIds.has(todo.parent_id)),
  );

  return { epics: groups, topLevel: timelineItems(topLevelTodos) };
}

/** Total dated rows a hierarchy holds, window aside — the denominator behind
 * the nav's "N outside this range". */
export function countHierarchyItems(hierarchy: TimelineHierarchy): number {
  return (
    hierarchy.topLevel.length +
    hierarchy.epics.reduce(
      (sum, group) => sum + (group.item ? 1 : 0) + group.tasks.length,
      0,
    )
  );
}

type Placement = NonNullable<ReturnType<typeof placeItem>>;

export interface PlacedEpicGroup {
  group: EpicGroup;
  place: Placement | null;
  tasks: { item: TimelineItem; place: Placement }[];
}

export interface PlacedTimelineHierarchy {
  epics: PlacedEpicGroup[];
  topLevel: { item: TimelineItem; place: Placement }[];
}

/**
 * A hierarchy, placed against one window.
 *
 * **An Epic group survives even when its own bar does not.** `place` is null
 * whenever the Epic's item is null (nothing to place at all) or falls
 * entirely outside the window — but the group itself is dropped only when
 * BOTH that and every one of its Tasks miss the window too, and kept
 * unconditionally when it has no dated content anywhere (the "always shown"
 * rule `buildTimelineHierarchy` states for a bare Epic). Otherwise a Task
 * scheduled this month under an Epic dated for next quarter would show under
 * no header at all, which is worse than a header with no bar drawn this page.
 */
export function placeTimelineHierarchy(
  hierarchy: TimelineHierarchy,
  ticks: string[],
  scale: TimelineScale,
): PlacedTimelineHierarchy {
  const epics = hierarchy.epics
    .map((group) => {
      const place = group.item ? placeItem(group.item, ticks, scale) : null;
      const tasks = placeItems(group.tasks, ticks, scale);

      return { group, place, tasks };
    })
    .filter(
      (placed) =>
        placed.group.item === null ||
        placed.place !== null ||
        placed.tasks.length > 0,
    );

  return { epics, topLevel: placeItems(hierarchy.topLevel, ticks, scale) };
}

/** Rows actually drawn this page — the numerator behind the nav's "N outside
 * this range", and what decides whether the grid has anything to show. */
export function countPlacedHierarchyItems(placed: PlacedTimelineHierarchy) {
  return (
    placed.topLevel.length +
    placed.epics.reduce(
      (sum, group) => sum + (group.place ? 1 : 0) + group.tasks.length,
      0,
    )
  );
}

/**
 * Work items with no date at all, minus the Epics — the Timeline's own
 * narrowing of `unscheduledTodos` (M28-B).
 *
 * An Epic with no dates already has a row — the bare header
 * `buildTimelineHierarchy` still gives it — so listing it a second time here
 * would show the same absence twice. A dateless Task keeps appearing here
 * exactly as before this milestone, whether or not it belongs to an Epic:
 * this list is still the one place it can be given its first range, and
 * which Epic (if any) owns it is not a fact this flat list needs to state.
 */
export function undatedTimelineTodos(todos: Todo[]): Todo[] {
  return unscheduledTodos(todos).filter((todo) => !isEpic(todo));
}
