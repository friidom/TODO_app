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
 * M6-A exists. `registry.test.ts` asserts that exactly one view reorders, so
 * adding a second is a failing test rather than a discovery in production.
 */

/**
 * Order matters: this is the order the tabs render in.
 *
 * Summary leads because it is the board's front page — the answer to "how is
 * this going" before the answer to "what is on it". It is **not** the default
 * mode, though: `useBoardView` still falls back to `board`, so every existing
 * `/boards/:id` link opens exactly the view it always opened.
 */
export const VIEW_MODES = ["summary", "board", "list"] as const;

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
