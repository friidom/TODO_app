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

/**
 * Epic groups and Sprint bars — the rows `timeline.ts`'s flat placement
 * reaches the grid through (M28-B; Sprint rows and Sprint-bound Task
 * clamping added M30/M31-Timeline).
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
 *
 * **A Task with no Epic never reaches this Timeline at all — not as a row,
 * not in "Undated".** The first cut of this milestone gave every dated,
 * unparented Task its own top-level row (a `topLevel: TimelineItem[]` field
 * here, rendered by `TimelineGrid` below the Epic groups) on the reasoning
 * that a Task should not vanish just because it has no Epic yet. The
 * reference this milestone actually follows draws a stricter line: this view
 * is the Epic breakdown, and a Task's place in it is always "under an Epic,
 * once it has one" — never "on its own, because it happens to carry a date".
 * A Task without a parent is not unfinished data here; it is simply out of
 * scope for this screen, exactly as it was before this Timeline could show
 * hierarchy at all, and the Board and List remain where every Task — parented
 * or not — is always visible. So the pipeline is `todos → Epics → each
 * Epic's own children`, full stop; nothing outside that shape is collected,
 * let alone placed.
 *
 * **Sprints are a THIRD, flat row group — not a third level of the Epic/Task
 * hierarchy.** A Sprint contains Epics and Tasks alike (the migration's own
 * "containment model"); it does not sit *under* one or *own* one the way an
 * Epic owns its Tasks. So `TimelineHierarchy.sprints` is its own list,
 * independent of `epics`, drawn above them — the ASCII reference in the
 * milestone brief draws exactly this shape: "Sprints" as one block, "Epics"
 * as a separate one beneath it, and nothing nested between the two.
 *
 * **A Sprint-bound Task's displayed range is its Sprint's, not its own.** A
 * Task with a `sprint_id` naming a Sprint that has *both* its own dates is
 * clamped: `boundSprint` finds that Sprint, and `buildTimelineHierarchy`
 * substitutes the Sprint's `start_date`/`end_date` for the Task's own before
 * ever calling `timelineItems` — so the placement math, the rollup a parent
 * Epic derives from it, and the bar's own width all agree with the Sprint
 * bar above it by construction, rather than by a second comparison somewhere
 * downstream. The Task's own `start_date`/`due_date` are never read or
 * written by this substitution — only a *shallow copy* passed to
 * `timelineItems` carries the swap, so the real row (and every other view
 * that reads it) is untouched. The `sprintBound` flag threaded alongside
 * each placed Task is what tells `TimelineRow` to withhold the drag handles
 * for exactly this row and no other — see `TimelineEpicGroup.tsx`.
 */

/**
 * A Task's own Sprint, when that Sprint has a usable range to clamp it to.
 *
 * **Both dates must be set.** `sprints.start_date`/`end_date` are
 * independently nullable, and a Sprint with only one of the two has no more
 * of a range to clamp a Task's bar to than a Task with only one of its own
 * dates has a range of its own — `timelineItems`' "a point, not a zero-width
 * bar" rule, restated one level up. A Task planned into such a Sprint keeps
 * its own dates (or its own undated state) exactly as if it were unplanned.
 */
function boundSprint(
  todo: Pick<Todo, "sprint_id">,
  sprintById: Map<string, Sprint>,
): Sprint | null {
  if (todo.sprint_id === null) return null;

  const sprint = sprintById.get(todo.sprint_id);

  if (!sprint || !sprint.start_date || !sprint.end_date) return null;

  return sprint;
}

/** One Sprint, placed on the axis by its own `start_date`/`end_date` — never
 * a `TimelineItem`, because a Sprint is not a `Todo` (the migration's own
 * reasoning for why it is a table of its own, restated for this view). Only
 * `start`/`end` are required beyond `sprint` itself, which is what lets
 * `placeItems` (`timeline.ts`) place these the same way it places a
 * `TimelineItem` — the function reads only those two fields. */
export interface SprintTimelineItem {
  sprint: Sprint;
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, `YYYY-MM-DD`. */
  end: string;
}

/**
 * Every Sprint with a usable range, as timeline rows — sorted the same way
 * `timelineItems` sorts a Task, so paging or re-fetching cannot reorder the
 * band from one render to the next.
 *
 * **A Sprint missing either date is not "shown with a gap" — it is not shown
 * at all.** Unlike a bare Epic (a container, always drawn even with nothing
 * to place under it) a Sprint IS its date range on this view; one with no
 * usable range has nothing this row type exists to say.
 */
function sprintTimelineItems(sprints: Sprint[]): SprintTimelineItem[] {
  const items: SprintTimelineItem[] = [];

  for (const sprint of sprints) {
    if (!sprint.start_date || !sprint.end_date) continue;

    const start = toCalendarDay(sprint.start_date);
    const end = toCalendarDay(sprint.end_date);

    // `sprints_date_range_check` forbids start > end at the database, same
    // defence `timelineItems` keeps for a `todos` row written before its own
    // constraint existed.
    items.push(
      start <= end ? { sprint, start, end } : { sprint, start: end, end: start },
    );
  }

  return items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.sprint.id.localeCompare(b.sprint.id)));
}

/**
 * One Epic's own row: its explicit dates if it has them, else a rollup of its
 * dated Tasks, else nothing to place at all.
 */
export interface EpicGroup {
  epic: Todo;
  item: TimelineItem | null;
  isDerived: boolean;
  /** This Epic's own Tasks that have at least one date — what draws as
   * nested rows, already in `timelineItems`' start/end/key order.
   * `sprintBound` says whether `item`'s range came from `boundSprint` rather
   * than the Task's own dates — see the module doc. */
  tasks: { item: TimelineItem; sprintBound: boolean }[];
  /** Every Task under this Epic, dated or not — what the progress badge
   * counts. Completion is a status question, not a scheduling one. */
  taskCount: number;
}

export interface TimelineHierarchy {
  /** Every Sprint with a usable range, in date order — drawn above every
   * Epic group, and never nested inside one (see the module doc). */
  sprints: SprintTimelineItem[];
  /** One entry per Epic on the board, in the order `epicsOf` returns them
   * (creation order — the same order `useEpics()` already lists them in).
   * See the module doc on why an unparented Task has no row of its own
   * here. */
  epics: EpicGroup[];
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
 *
 * Rolls up from `tasks` as given — already Sprint-clamped where that
 * applies, so a derived Epic bar agrees with what its Sprint-bound children
 * actually draw underneath it, not with dates nobody sees.
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
 * The board's work, grouped: every Epic with its own Tasks, and every Sprint
 * with a usable range.
 *
 * **Membership is `childrenOf(todos, epic.id)`, and nothing wider.** A Task
 * whose `parent_id` names an Epic that is not in `todos` — filtered out by
 * search, by the type filter, or simply not (yet) in a transient cache —
 * therefore has no group to join and is not collected at all: it is not this
 * function's job to decide where an orphaned Task should go, only to fold
 * `todos` into the Epics that are actually present. A genuinely unparented
 * Task (`parent_id === null`) is excluded the same way, on purpose — see the
 * module doc.
 *
 * `sprints` defaults to `[]` — every existing call site (and every existing
 * test) that has no Sprints to pass keeps working exactly as it did before
 * this parameter existed.
 */
export function buildTimelineHierarchy(
  todos: Todo[],
  sprints: Sprint[] = [],
): TimelineHierarchy {
  const epics = epicsOf(todos);
  const sprintById = new Map(sprints.map((sprint) => [sprint.id, sprint]));

  const groups: EpicGroup[] = epics.map((epic) => {
    const children = childrenOf(todos, epic.id);

    // A Sprint-bound child is placed at its Sprint's own range rather than
    // its own start/due — on a shallow copy, purely for `timelineItems`'
    // placement math. The child's own stored dates are never touched; see
    // the module doc.
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

/** Total dated rows a hierarchy holds, window aside — the denominator behind
 * the nav's "N outside this range". Sprint rows are not counted here: the
 * nav's message is about Epics and Tasks specifically ("N epics have dates",
 * "N dated items are outside it"), and folding a third, differently-shaped
 * row into the same number would make that copy wrong rather than richer. */
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

/**
 * One Sprint's placed bar, plus the two purely-visual facts the band needs to
 * draw it: which stacked line it sits on, and whether either end butts
 * directly against a neighbour's.
 *
 * **`lane` exists because the Sprints band is ONE row, not one row per
 * Sprint** — the reference this milestone follows lays every Sprint out
 * along a single line, which is also what makes the angled ends below mean
 * anything. Two Sprints whose columns genuinely overlap cannot share that
 * line without one hiding the other, so `packSprintLanes` drops the second
 * onto a lane beneath. On the ordinary board — Sprints run back to back —
 * every Sprint lands on lane 0 and the band is exactly one row tall.
 */
export interface PlacedSprint {
  item: SprintTimelineItem;
  place: Placement;
  /** Which stacked line to draw on. 0 for every Sprint that does not overlap
   * an earlier one, which is the common case. */
  lane: number;
  /** The previous Sprint on this lane ends exactly where this one begins. */
  angledStart: boolean;
  /** The next Sprint on this lane begins exactly where this one ends. */
  angledEnd: boolean;
}

export interface PlacedTimelineHierarchy {
  sprints: PlacedSprint[];
  epics: PlacedEpicGroup[];
}

/**
 * Sprints assigned to stacked lines, and told where they touch.
 *
 * **Greedy interval packing over the placed columns, not the dates.** The
 * question the band is asking is "do these two bars collide on screen",
 * which is a question about `place.index`/`place.span` — a range clipped at
 * the window edge collides exactly as far as it is drawn, not as far as it
 * runs. Input must already be in start order, which `sprintTimelineItems`
 * guarantees and `placeItems` preserves.
 *
 * `angledStart`/`angledEnd` are set only for an *exact* abutment — the next
 * bar begins on the very column the previous one ended. That is the
 * relationship the angled end is drawn to show (one Sprint handing over to
 * the next); a pair with a gap between them needs no such signal, and a pair
 * that genuinely overlaps has been split onto separate lanes and no longer
 * touches at all.
 */
function packSprintLanes(
  placed: { item: SprintTimelineItem; place: Placement }[],
): PlacedSprint[] {
  /** The first free column on each lane, i.e. one past its last bar. */
  const laneEnds: number[] = [];
  /** The last bar placed on each lane, so an abutment can mark both sides. */
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

    // The other half of the same abutment. Safe to write through: `previous`
    // is an object this function built and still owns.
    if (abuts && previous) previous.angledEnd = true;

    laneEnds[lane] = place.index + place.span;
    laneLast[lane] = entry;

    out.push(entry);
  }

  return out;
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
 *
 * **A Sprint has no such fallback.** Unlike an Epic it is not a container —
 * it does not "survive" off-window, because it has nothing to survive as
 * once its own bar cannot be drawn; a Sprint whose range never enters the
 * current window is simply not one of this page's rows, exactly like a
 * dated Task's own bar off-window.
 */
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
    .filter(
      (placed) =>
        placed.group.item === null ||
        placed.place !== null ||
        placed.tasks.length > 0,
    );

  const sprints = packSprintLanes(placeItems(hierarchy.sprints, ticks, scale));

  return { sprints, epics };
}

/** Rows actually drawn this page — the numerator behind the nav's "N outside
 * this range", and what decides whether the grid has anything to show.
 * Sprint rows excluded, matching `countHierarchyItems`. */
export function countPlacedHierarchyItems(placed: PlacedTimelineHierarchy) {
  return placed.epics.reduce(
    (sum, group) => sum + (group.place ? 1 : 0) + group.tasks.length,
    0,
  );
}

/**
 * Epic-owned Tasks with no date at all — the Timeline's own narrowing of
 * `unscheduledTodos` (M28-B, corrected same milestone).
 *
 * **Neither Epics nor unparented Tasks belong here.** An Epic with no dates
 * already has a row — the bare header `buildTimelineHierarchy` still gives
 * it — so listing it a second time would show the same absence twice. An
 * unparented Task is out of scope for this whole view (see the module doc);
 * this list existing at all must not become a side door it reappears
 * through. What is left, and the one case this still serves, is a Task that
 * already belongs to an Epic but has not been scheduled yet — it needs
 * somewhere to be given its first range, and this is that place. `parent_id
 * !== null` is sufficient to mean "belongs to an Epic" rather than checking
 * membership again: `useVisibleTodos` has already dropped every genuine
 * Subtask (M27), so any non-Epic row with a parent left in this array is a
 * Task under an Epic by construction.
 *
 * **A Sprint-bound Task with no dates of its own is not "undated" either.**
 * `boundSprint` gives it a range from its Sprint the same way it does inside
 * `buildTimelineHierarchy`; listing it here too — with a "no dates" affordance
 * to draw a range that would immediately be overridden by its Sprint — would
 * offer a gesture with no effect. `sprints` defaults to `[]`, matching
 * `buildTimelineHierarchy`'s own default, so every existing call site keeps
 * behaving exactly as it did before this parameter existed.
 */
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
