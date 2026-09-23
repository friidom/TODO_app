import type { SortDir, SortKey } from "@/services/todos/view";
import type { ViewScope } from "@/services/views/scope";
import type { Todo } from "@/types/data";

// The predefined filters declared as values, the shape services/views/registry.ts
// and services/admin/registry.ts already use. The nav renders this list, the
// page reads one entry, and a test pins both — so a filter cannot be added to
// the sidebar and forgotten in the router.
//
// This is the seam saved/custom/shared filters grow from: a stored filter is a
// row with the same three answers (what to look at, what to keep, how to order
// it). None of it is a query language, and it does not need to become one to
// hold a user's own conditions later.

export const FILTER_IDS = [
  "my-open",
  "reported-by-me",
  "all-work",
  "open-work",
  "done-work",
  "viewed-recently",
  "created-recently",
  "updated-recently",
  "resolved-recently",
] as const;

export type FilterId = (typeof FILTER_IDS)[number];

// What a predicate is allowed to know. doneColumnIds rather than a category on
// the card, because doneness is a property of the column a card sits in.
export interface FilterContext {
  userId: string | undefined;
  doneColumnIds: Set<string>;
}

export interface FilterDefinition {
  id: FilterId;
  label: string;
  // Every predefined filter is cross-board today. A saved filter scoped to one
  // board is the same field with a different value.
  scope: ViewScope;
  // Absent means "keep everything" — All work is a filter with no condition.
  match?: (todo: Todo, context: FilterContext) => boolean;
  sort?: { key: SortKey; dir: SortDir };
  // The one filter whose set comes from the viewer's own device rather than
  // from a predicate over the board data.
  source?: "viewed";
}

const ALL: ViewScope = { kind: "all" };

const isDone = (todo: Todo, context: FilterContext) =>
  todo.column_id !== null && context.doneColumnIds.has(todo.column_id);

export const FILTER_DEFINITIONS: Record<FilterId, FilterDefinition> = {
  "my-open": {
    id: "my-open",
    label: "My open work",
    scope: ALL,
    match: (todo, context) =>
      Boolean(context.userId) &&
      todo.assignee_id === context.userId &&
      !isDone(todo, context),
    sort: { key: "updated", dir: "desc" },
  },
  "reported-by-me": {
    id: "reported-by-me",
    label: "Reported by me",
    scope: ALL,
    match: (todo, context) =>
      Boolean(context.userId) && todo.creator_id === context.userId,
    sort: { key: "created", dir: "desc" },
  },
  "all-work": {
    id: "all-work",
    label: "All work",
    scope: ALL,
    sort: { key: "updated", dir: "desc" },
  },
  "open-work": {
    id: "open-work",
    label: "Open work",
    scope: ALL,
    match: (todo, context) => !isDone(todo, context),
    sort: { key: "updated", dir: "desc" },
  },
  "done-work": {
    id: "done-work",
    label: "Done work",
    scope: ALL,
    match: isDone,
    sort: { key: "updated", dir: "desc" },
  },
  "viewed-recently": {
    id: "viewed-recently",
    label: "Viewed recently",
    scope: ALL,
    // Ordered by when this browser saw it, so no sort key applies.
    source: "viewed",
  },
  "created-recently": {
    id: "created-recently",
    label: "Created recently",
    scope: ALL,
    sort: { key: "created", dir: "desc" },
  },
  "updated-recently": {
    id: "updated-recently",
    label: "Updated recently",
    scope: ALL,
    sort: { key: "updated", dir: "desc" },
  },
  "resolved-recently": {
    id: "resolved-recently",
    label: "Resolved recently",
    scope: ALL,
    // completed_at, not the column: a card moved out of Done is not resolved,
    // and the trigger clears the stamp when that happens.
    match: (todo) => todo.completed_at !== null,
    sort: { key: "completed", dir: "desc" },
  },
};

export function filterDefinitions(): FilterDefinition[] {
  return FILTER_IDS.map((id) => FILTER_DEFINITIONS[id]);
}

export function isFilterId(value: unknown): value is FilterId {
  return (
    typeof value === "string" && (FILTER_IDS as readonly string[]).includes(value)
  );
}

export function filterPath(id: FilterId): string {
  return `/filters/${id}`;
}
