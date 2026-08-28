/**
 * What a view *is*, as a value (M16).
 *
 * Board and List are two renderings of one pipeline, and the date-based views
 * will be more. What separates them is not their data — that is shared — but
 * what they can *do* with it: the board reorders by drag, the list does not,
 * and a calendar would place cards on days without touching `position` at all.
 *
 * Before this, that difference was implicit. `useBoardView` derived
 * `dndDisabled` from a hardcoded expression that happened to be right for the
 * board and irrelevant to the list, and the answer to "does this view write
 * order?" was a code review rather than a lookup.
 *
 * **The capability that matters most is `canReorder`**, and the reason is
 * recorded in the plan rather than here: `todos.position` is a dense integer,
 * so a *second* surface that writes order means two views renumbering one
 * column from two stale snapshots — silent data loss, and the whole reason
 * M6-A exists. `registry.test.ts` pins the exact set of views that reorder —
 * `["board", "backlog"]` since M31-C — so adding a third is a failing test
 * rather than a discovery in production. Two is safe here because the two
 * order *different* fields (`rank` and `backlog_rank`); the hazard is two
 * views renumbering the same one, which is what the test's own comment tells
 * the next person to check.
 */

/**
 * Order matters: this is the order the tabs render in.
 *
 * Summary leads because it is the board's front page — the answer to "how is
 * this going" before the answer to "what is on it". It is **not** the default
 * mode, though: `useBoardView` still falls back to `board`, so every existing
 * `/boards/:id` link opens exactly the view it always opened.
 */
export const VIEW_MODES = [
  "summary",
  "board",
  "list",
  "calendar",
  "timeline",
  "backlog",
] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

export interface ViewCapabilities {
  /**
   * Writes `todos.position` — i.e. a drop here changes the stored order.
   *
   * **Adding a second `true` requires M6-A first.** See the note above.
   */
  canReorder: boolean;
  /** Renders `groupTodos` output as its own sections or lanes. */
  canGroup: boolean;
  /** Honours the sort control. A view with its own axis (a calendar) does not. */
  canSort: boolean;
}

export interface ViewDefinition {
  mode: ViewMode;
  label: string;
  capabilities: ViewCapabilities;
}

export const VIEWS: Record<ViewMode, ViewDefinition> = {
  summary: {
    mode: "summary",
    label: "Summary",
    /**
     * All three false, and each for its own reason rather than as a default.
     *
     * It cannot reorder because it renders no card in a droppable. It cannot
     * group because its widgets *are* groupings — of status, priority, type and
     * assignee — and a second grouping layered over them would mean a status
     * chart of the tasks grouped by status. It cannot sort because a count has
     * no order to honour.
     *
     * This is the first view where the capability flags do visible work:
     * `ViewToolbar` reads them and hides the Group and Sort controls, rather
     * than leaving two controls on screen that change nothing. Filter and
     * search still apply — a summary of the filtered board is a real question,
     * and it is the same `useVisibleTodos` pipeline the other two read.
     */
    capabilities: { canReorder: false, canGroup: false, canSort: false },
  },
  board: {
    mode: "board",
    label: "Board",
    capabilities: { canReorder: true, canGroup: true, canSort: true },
  },
  list: {
    mode: "list",
    label: "List",
    // No drag: the list has never registered a draggable, and now that is a
    // stated property rather than an absence someone could "fix" by adding one.
    capabilities: { canReorder: false, canGroup: true, canSort: true },
  },
  calendar: {
    mode: "calendar",
    label: "Calendar",
    /**
     * All three false (M19), and each for a different reason.
     *
     * **`canReorder: false` even though the calendar drags.** The flag does not
     * mean "has drag and drop" — it means *writes `todos.position`*, which is
     * the dense integer two views cannot renumber from two snapshots without
     * losing one. A calendar drop writes `due_date` through the same
     * `updateTodo` every field control uses, so it adds no second order-writer
     * and `registry.test.ts`'s M6-A guard keeps passing untouched.
     *
     * **`canSort: false` because the view has its own axis** — which is the
     * case `canSort`'s own doc comment named before this view existed. Dates
     * are the order; a "sort by priority" over a calendar has nothing to
     * reorder.
     *
     * **`canGroup: false` because the date grouping *is* the layout.** A second
     * grouping would mean a calendar of the board grouped by assignee, which is
     * either swimlanes of calendars or a calendar that silently shows one
     * person's work. Filter and search still apply, and are the right control
     * for "only show me mine".
     */
    capabilities: { canReorder: false, canGroup: false, canSort: false },
  },
  timeline: {
    mode: "timeline",
    label: "Timeline",
    /**
     * All three false (M20), and `canReorder` is the load-bearing one.
     *
     * **A timeline's rows are ordered by `start_date`, and that order is
     * derived at render — never stored.** The plan makes this a decision rather
     * than an implementation detail: *"a Gantt whose rows can be dragged into
     * an arbitrary order is a second ranked surface, and it would reopen
     * M3-10 and M6-A on the day it ships."*
     *
     * **The timeline does drag as of M20-B, and this stays false**, which is
     * the same reading the calendar entry above already relies on: the flag
     * means *writes `todos.position`*, not *has drag and drop*. Moving a bar,
     * dragging an end and sweeping out a new range all write `start_date` and
     * `due_date` through `useUpdateTodo`; none of them touches `position`, and
     * the row they land on is still whichever one the dates sort them into. So
     * `todos.position` keeps exactly one writer and `registry.test.ts`'s guard
     * keeps passing untouched — the vertical order remains underivable from a
     * gesture, which is the property that was actually being protected.
     *
     * `canSort: false` because time is the axis — the case `canSort`'s own doc
     * comment named. `canGroup: false` because a second grouping over a
     * chronological layout is either swimlanes of Gantts or a chart quietly
     * showing one person's work; filter and search are the right controls for
     * narrowing, and they still apply.
     */
    capabilities: { canReorder: false, canGroup: false, canSort: false },
  },
  backlog: {
    mode: "backlog",
    label: "Backlog",
    /**
     * `canReorder: true` since M31-C — the second reordering view, and
     * still safe under the M6-A guard below because it is not a second
     * writer of `todos.position`/`rank` at all. `todos.backlog_rank` is its
     * own fractional-rank field, ordering this view's lists the same way
     * `rank` orders a Kanban column, but as a genuinely separate value
     * nothing else reads. Two views may each reorder their own field
     * without conflict; the hazard M6-A's guard exists to catch is two
     * views renumbering the *same* field from two stale snapshots, which
     * this is not.
     *
     * `canGroup: false` and `canSort: false` for the same reason the
     * Timeline gives: this view's grouping — by Sprint, then a Backlog
     * section — is the layout itself, not a `GROUP_KEYS` choice. Filter and
     * search still apply, same as every other view.
     */
    capabilities: { canReorder: true, canGroup: false, canSort: false },
  },
};

export function isViewMode(value: unknown): value is ViewMode {
  return (
    typeof value === "string" &&
    (VIEW_MODES as readonly string[]).includes(value)
  );
}

export function capabilitiesOf(mode: ViewMode): ViewCapabilities {
  return VIEWS[mode].capabilities;
}

/** The views that write stored order. Read by the test that guards M6-A. */
export function reorderingViews(): ViewMode[] {
  return VIEW_MODES.filter((mode) => VIEWS[mode].capabilities.canReorder);
}
