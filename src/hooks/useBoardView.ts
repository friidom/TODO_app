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

export type BoardViewMode = ViewMode;

// the URL is the store — makes a view shareable and survivable across a reload for free, no context/provider needed.
// only non-default values get written, and every write replaces history so ticking filters doesn't fill the back button.
export interface BoardView {
  mode: BoardViewMode;
  filters: TodoFilters;
  query: string;
  sort: SortKey;
  dir: SortDir;
  group: GroupKey;
  filterCount: number;
  // dragging needs stored order to mean anything — off under a sort or swimlanes, not just because rows are filtered
  dndDisabled: boolean;
  dndReason: string | null;

  setMode: (mode: BoardViewMode) => void;
  toggleFilter: (category: FilterCategory, value: string) => void;
  clearFilters: () => void;
  clearCategory: (category: FilterCategory) => void;
  setQuery: (query: string) => void;
  setSort: (sort: SortKey) => void;
  setDir: (dir: SortDir) => void;
  setGroup: (group: GroupKey) => void;
  enableDnd: () => void;
}

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

  // keyed on the serialised string, not the object — useSearchParams hands back a fresh instance every render
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
      dir:
        sort === "manual"
          ? ("asc" as SortDir)
          : readOne(params, "dir", ["asc", "desc"] as const, "asc"),
      group,
      filterCount: countFilters(filters),
    };
  }, [key]);

  const write = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (previous) => {
          // copy — mutating the handed-over instance would edit the current location in place
          const next = new URLSearchParams(previous);

          mutate(next);

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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
    // stored raw, not trimmed — a trailing space is a word still being typed, searchTodos trims when it matters
    (query: string) => write((params) => set(params, "q", query, "")),
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

        // manual has no direction — don't leave a stale dir that resurrects on the next sort
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

        // only swimlanes block a drag — grouping by status is just the board itself
        if (isSwimlaneGroup(readOne(params, "group", GROUP_KEYS, "none"))) {
          params.delete("group");
        }
      }),
    [write],
  );

  const { mode, sort, group } = state;

  const canReorder = capabilitiesOf(mode).canReorder;

  const dndDisabled =
    !canReorder || sort !== "manual" || isSwimlaneGroup(group);

  return {
    ...state,
    dndDisabled,
    // null when the view just doesn't reorder — nothing to explain there
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
