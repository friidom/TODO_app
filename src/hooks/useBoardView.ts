import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import {
  FILTER_CATEGORIES,
  GROUP_KEYS,
  GROUP_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  countFilters,
  isSwimlaneGroup,
  type FilterCategory,
  type GroupKey,
  type SortDir,
  type SortKey,
  type TodoFilters,
} from "@/services/todos/view";
import {
  VIEW_MODES,
  capabilitiesOf,
  type ViewMode,
} from "@/services/views/registry";

/**
 * Which rendering of the scope's data is on screen.
 *
 * Re-exported from the M16 view registry rather than declared here: the
 * registry is where a view's *capabilities* live, and having the mode union in
 * one file and the capability table in another is how the two drift.
 */
export type BoardViewMode = ViewMode;

/**
 * How the board is being looked at, held in the URL.
 *
 * **The URL is the store.** `react-router` is already a dependency and
 * `useSearchParams` was unused until now, so preserving a view across a reload
 * and making one shareable costs no library, no context and no provider — which
 * is the whole reason this is not a `useState` in `BoardPage`. Filtering a board
 * down to what you care about and then sending someone the link is the point.
 *
 * Only non-default values are written, so an untouched board keeps a clean
 * `/boards/:id` and no key ever appears meaning "the default".
 *
 * Every write is `replace: true`. Ticking six filter checkboxes should not cost
 * six presses of the back button to undo; the board you arrived at is the entry
 * the history deserves.
 */
export interface BoardView {
  mode: BoardViewMode;
  filters: TodoFilters;
  /**
   * The free-text query, held in the URL as `q` (M16).
   *
   * A search param like everything else here, and for the same reason: a
   * narrowed view is worth sending to someone. It is a *view* concern, not a
   * board one — `searchTodos` runs over the rows already in the cache and
   * queries nothing, which is the decision M12 recorded for filtering and this
   * inherits.
   */
  query: string;
  sort: SortKey;
  dir: SortDir;
  group: GroupKey;
  /** Selected filter values across every category — the badge on the button. */
  filterCount: number;
  /**
   * Whether dragging is off, and why.
   *
   * A drop is an instruction about *position*, and position is only meaningful
   * while the board is showing stored order. Under another sort the card the
   * user aimed above is not the card the board would renumber; under swimlanes a
   * drop would have to mean two things at once — move column *and* change the
   * lane's dimension. Rather than guess, the board says so and offers the reset.
   *
   * A filter alone does **not** disable it: hidden rows change which gaps are on
   * screen, not what a gap means, and `resolveDropIndex` translates the one into
   * the other.
   */
  dndDisabled: boolean;
  dndReason: string | null;

  setMode: (mode: BoardViewMode) => void;
  toggleFilter: (category: FilterCategory, value: string) => void;
  clearFilters: () => void;
  /** Untick every value in one category, leaving the others alone. */
  clearCategory: (category: FilterCategory) => void;
  setQuery: (query: string) => void;
  setSort: (sort: SortKey) => void;
  setDir: (dir: SortDir) => void;
  setGroup: (group: GroupKey) => void;
  /** Undo whatever is blocking a drag, from the hint strip. */
  enableDnd: () => void;
}

/** URL keys, listed once so `clearFilters` cannot fall out of step with the reads. */
const FILTER_PARAMS: Record<FilterCategory, string> = {
  assignee: "assignee",
  type: "type",
  priority: "priority",
  due: "due",
  status: "status",
};

function readList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);

  if (!raw) return [];

  // Deduplicated: a hand-edited URL is untrusted input like any other, and a
  // repeated value would inflate the filter count without changing the result.
  return [...new Set(raw.split(",").filter(Boolean))];
}

function readOne<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = params.get(key);

  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

export function useBoardView(): BoardView {
  const [searchParams, setSearchParams] = useSearchParams();

  // Keyed on the serialised params rather than the object: `useSearchParams`
  // hands back a fresh URLSearchParams on every location change, and a filters
  // object with a new identity each render would re-run every memo downstream —
  // including the one that groups the whole board.
  const key = searchParams.toString();

  const state = useMemo(() => {
    const params = new URLSearchParams(key);

    const filters = FILTER_CATEGORIES.reduce((acc, category) => {
      acc[category] = readList(params, FILTER_PARAMS[category]);
      return acc;
    }, {} as TodoFilters);

    const sort = readOne(params, "sort", SORT_KEYS, "manual");
    const group = readOne(params, "group", GROUP_KEYS, "none");

    return {
      mode: readOne(params, "view", VIEW_MODES, "board"),
      filters,
      query: params.get("q") ?? "",
      sort,
      // Direction is meaningless without a key to apply it to.
      dir:
        sort === "manual"
          ? ("asc" as SortDir)
          : readOne(params, "dir", ["asc", "desc"] as const, "asc"),
      group,
      filterCount: countFilters(filters),
    };
  }, [key]);

  /** One write path, so no caller has to remember `replace` or the merge. */
  const write = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (previous) => {
          // A copy: mutating the instance react-router handed over would edit
          // the current location's params in place.
          const next = new URLSearchParams(previous);

          mutate(next);

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /** Absent when it is the default — the URL says only what was chosen. */
  const set = useCallback(
    (
      params: URLSearchParams,
      param: string,
      value: string,
      fallback: string,
    ) => {
      if (value === fallback) params.delete(param);
      else params.set(param, value);
    },
    [],
  );

  const setMode = useCallback(
    (mode: BoardViewMode) =>
      write((params) => set(params, "view", mode, "board")),
    [write, set],
  );

  const setQuery = useCallback(
    (query: string) =>
      // Stored raw rather than trimmed: a trailing space is a word the user is
      // still typing, and eating it as they type is the input fighting back.
      // `searchTodos` trims when it matches, which is where it matters.
      write((params) => set(params, "q", query, "")),
    [write, set],
  );

  const toggleFilter = useCallback(
    (category: FilterCategory, value: string) =>
      write((params) => {
        const param = FILTER_PARAMS[category];
        const current = readList(params, param);

        const next = current.includes(value)
          ? current.filter((it) => it !== value)
          : [...current, value];

        if (next.length) params.set(param, next.join(","));
        else params.delete(param);
      }),
    [write],
  );

  const clearCategory = useCallback(
    (category: FilterCategory) =>
      write((params) => params.delete(FILTER_PARAMS[category])),
    [write],
  );

  const clearFilters = useCallback(
    () =>
      write((params) => {
        for (const param of Object.values(FILTER_PARAMS)) params.delete(param);
      }),
    [write],
  );

  const setSort = useCallback(
    (sort: SortKey) =>
      write((params) => {
        set(params, "sort", sort, "manual");

        // Manual has no direction to remember, and leaving a stale `dir` in the
        // URL would resurrect it the next time a key was picked.
        if (sort === "manual") params.delete("dir");
      }),
    [write, set],
  );

  const setDir = useCallback(
    (dir: SortDir) => write((params) => set(params, "dir", dir, "asc")),
    [write, set],
  );

  const setGroup = useCallback(
    (group: GroupKey) => write((params) => set(params, "group", group, "none")),
    [write, set],
  );

  const enableDnd = useCallback(
    () =>
      write((params) => {
        params.delete("sort");
        params.delete("dir");

        // Only swimlanes block a drag; grouping by status is the board itself
        // and is worth keeping when the user asks for dragging back.
        if (isSwimlaneGroup(readOne(params, "group", GROUP_KEYS, "none"))) {
          params.delete("group");
        }
      }),
    [write],
  );

  const { mode, sort, group } = state;

  // **Read off the registry first (M16).** A view that does not reorder cannot
  // have dragging "disabled by the sort" — it never had it. Asking the
  // capability table rather than assuming the board is what stops the next view
  // from re-deriving this expression with its own subtly different answer.
  const canReorder = capabilitiesOf(mode).canReorder;

  const dndDisabled =
    !canReorder || sort !== "manual" || isSwimlaneGroup(group);

  return {
    ...state,
    dndDisabled,
    // The sort is named first: it is the one a user is most likely to have set
    // without expecting it to cost them dragging.
    // Null when the view simply does not reorder: the hint strip explains why
    // dragging *stopped* working, and there is nothing to explain on a view
    // that never offered it.
    dndReason:
      !dndDisabled || !canReorder
        ? null
        : sort !== "manual"
          ? `Sorted by ${SORT_LABELS[sort]}`
          : `Grouped by ${GROUP_LABELS[group]}`,
    setMode,
    toggleFilter,
    clearFilters,
    clearCategory,
    setQuery,
    setSort,
    setDir,
    setGroup,
    enableDnd,
  };
}
