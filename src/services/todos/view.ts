import { memberName } from "@/components/members/memberLabels";
import {
  PRIORITIES,
  PRIORITY_OPTIONS,
  priorityRank,
  toPriority,
} from "@/constants/priorities";
import { columnTitle } from "@/constants/columns";
import { WORK_TYPE_OPTIONS, toWorkType } from "@/constants/workTypes";
import type { BoardMember } from "@/services/members/membersApi";
import type { IColumn, Todo } from "@/types/data";
import { dueStatus, todayISO } from "@/utils/dueDate";
import { byRank } from "@/utils/rank";

// Filtering, sorting and grouping as pure functions over the board array — nothing here touches the database.

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export const FILTER_CATEGORIES = [
  "assignee",
  "type",
  "priority",
  "due",
  "status",
] as const;

export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

export const FILTER_LABELS: Record<FilterCategory, string> = {
  assignee: "Assignee",
  status: "Status",
  type: "Work type",
  priority: "Priority",
  due: "Due date",
};

// an empty array means the category is off, not that it excludes everything
export type TodoFilters = Record<FilterCategory, string[]>;

export const EMPTY_FILTERS: TodoFilters = {
  assignee: [],
  type: [],
  priority: [],
  due: [],
  status: [],
};

export const UNSET = "none";

export const ME = "me";

export const DUE_BUCKETS = ["none", "overdue", "today", "upcoming"] as const;

export type DueBucket = (typeof DUE_BUCKETS)[number];

export const DUE_LABELS: Record<DueBucket, string> = {
  none: "No due date",
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Upcoming",
};

export function countFilters(filters: TodoFilters): number {
  return FILTER_CATEGORIES.reduce(
    (total, category) => total + filters[category].length,
    0,
  );
}

function matchesAssignee(
  todo: Todo,
  selected: string[],
  currentUserId: string | undefined,
) {
  if (!selected.length) return true;

  return selected.some((value) => {
    if (value === UNSET) return todo.assignee_id === null;

    // resolved here, not stored, so a shared URL means "assigned to whoever opened it"
    if (value === ME)
      return !!currentUserId && todo.assignee_id === currentUserId;

    return todo.assignee_id === value;
  });
}

function matchesType(todo: Todo, selected: string[]) {
  if (!selected.length) return true;

  return selected.includes(toWorkType(todo.type));
}

function matchesPriority(todo: Todo, selected: string[]) {
  if (!selected.length) return true;

  const priority = toPriority(todo.priority);

  return selected.includes(priority ?? UNSET);
}

function matchesDue(todo: Todo, selected: string[], today: string) {
  if (!selected.length) return true;

  if (todo.due_date === null) return selected.includes(UNSET);

  return selected.includes(dueStatus(todo.due_date, today));
}

function matchesStatus(todo: Todo, selected: string[]) {
  if (!selected.length) return true;

  return todo.column_id !== null && selected.includes(todo.column_id);
}

// AND between categories, OR within one — "Bug or Story, assigned to me", not "Bug and Story"
export function filterTodos(
  todos: Todo[],
  filters: TodoFilters,
  currentUserId?: string,
  today: string = todayISO(),
): Todo[] {
  if (countFilters(filters) === 0) return todos;

  return todos.filter(
    (todo) =>
      matchesAssignee(todo, filters.assignee, currentUserId) &&
      matchesType(todo, filters.type) &&
      matchesPriority(todo, filters.priority) &&
      matchesDue(todo, filters.due, today) &&
      matchesStatus(todo, filters.status),
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// matches "KAN-12", "ops-7", or a bare "12" — the prefix is thrown away since it's board-specific and a view can span boards
const KEY_QUERY = /^\s*(?:([a-z][a-z0-9]*)-)?(\d+)\s*$/i;

function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// a bare number matches key OR title (unioned) — key-only used to hide title matches on numeric-titled cards
export function searchTodos(todos: Todo[], query: string): Todo[] {
  const needle = normalise(query);

  if (!needle) return todos;

  const key = KEY_QUERY.exec(needle);

  if (key) {
    const [, prefix, digits] = key;
    const number = Number(digits);

    if (prefix) return todos.filter((todo) => todo.board_key === number);

    return todos.filter(
      (todo) =>
        todo.board_key === number ||
        normalise(todo.title ?? "").includes(needle),
    );
  }

  return todos.filter((todo) => normalise(todo.title ?? "").includes(needle));
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export const SORT_KEYS = [
  "manual",
  "due",
  "created",
  "updated",
  "priority",
  "title",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export const SORT_LABELS: Record<SortKey, string> = {
  manual: "Manual",
  due: "Due date",
  created: "Created",
  updated: "Updated",
  priority: "Priority",
  title: "Title",
};

// due dates compare fine as plain YYYY-MM-DD strings since the format is fixed-width and big-endian
function sortValue(todo: Todo, key: SortKey): string | number | null {
  switch (key) {
    case "due":
      return todo.due_date;
    case "created":
      return todo.created_at;
    case "updated":
      return todo.updated_at;
    case "priority":
      return toPriority(todo.priority) === null
        ? null
        : priorityRank(todo.priority);
    case "title":
      return todo.title?.trim() || null;
    case "manual":
      return null;
  }
}

// manual returns the input untouched, no copy — cards with no value always sort last, in both directions
export function sortTodos(
  todos: Todo[],
  key: SortKey,
  dir: SortDir = "asc",
): Todo[] {
  if (key === "manual") return todos;

  const sign = dir === "desc" ? -1 : 1;

  return todos.slice().sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);

    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    if (typeof left === "number" && typeof right === "number") {
      return sign * (left - right);
    }

    return sign * String(left).localeCompare(String(right));
  });
}

// columns left to right, position top to bottom — the cache's own array order doesn't match this once anything's been dragged
export function orderByBoard(todos: Todo[], columns: IColumn[]): Todo[] {
  const rank = new Map(
    columns
      .slice()
      .sort(byRank)
      .map((column, index) => [column.id, index]),
  );

  // a card with a missing column sorts to the end, not the front
  const of = (todo: Todo) =>
    rank.get(todo.column_id ?? "") ?? Number.MAX_SAFE_INTEGER;

  return todos.slice().sort((a, b) => of(a) - of(b) || byRank(a, b));
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export const GROUP_KEYS = [
  "none",
  "status",
  "assignee",
  "type",
  "priority",
] as const;

export type GroupKey = (typeof GROUP_KEYS)[number];

export const GROUP_LABELS: Record<GroupKey, string> = {
  none: "None",
  status: "Status",
  assignee: "Assignee",
  type: "Work type",
  priority: "Priority",
};

// status and none are excluded — grouping by status is the identity, it's just the board that was already there
export function isSwimlaneGroup(group: GroupKey): boolean {
  return group !== "none" && group !== "status";
}

export interface TodoGroup {
  key: string;
  label: string;
  todos: Todo[];
}

export interface GroupContext {
  columns: IColumn[];
  members: BoardMember[];
}

const ALL = "all";

function bucketBy(
  todos: Todo[],
  keyOf: (todo: Todo) => string,
): Map<string, Todo[]> {
  const buckets = new Map<string, Todo[]>();

  for (const todo of todos) {
    const key = keyOf(todo);
    const bucket = buckets.get(key);

    if (bucket) bucket.push(todo);
    else buckets.set(key, [todo]);
  }

  return buckets;
}

// runs on the already-filtered, already-sorted array; empty groups drop, except status (empty columns still exist)
export function groupTodos(
  todos: Todo[],
  group: GroupKey,
  { columns, members }: GroupContext,
): TodoGroup[] {
  if (group === "none") return [{ key: ALL, label: "", todos }];

  if (group === "status") {
    const buckets = bucketBy(todos, (todo) => todo.column_id ?? UNSET);

    const groups: TodoGroup[] = columns
      .slice()
      .sort(byRank)
      .map((column) => ({
        key: column.id,
        label: columnTitle(column.title),
        todos: buckets.get(column.id) ?? [],
      }));

    const orphans = buckets.get(UNSET);

    if (orphans?.length) {
      groups.push({ key: UNSET, label: "No status", todos: orphans });
    }

    return groups;
  }

  if (group === "assignee") {
    const buckets = bucketBy(todos, (todo) => todo.assignee_id ?? UNSET);

    const named = members
      .filter((member) => buckets.has(member.id))
      .map((member) => ({
        key: member.id,
        label: memberName(member),
        todos: buckets.get(member.id) ?? [],
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // assignee_id survives a member being removed from the board, so those cards need a home too
    const known = new Set(members.map((member) => member.id));

    const former = [...buckets.keys()]
      .filter((key) => key !== UNSET && !known.has(key))
      .map((key) => ({
        key,
        label: "Former member",
        todos: buckets.get(key) ?? [],
      }));

    const unassigned = buckets.get(UNSET);

    return [
      ...named,
      ...former,
      ...(unassigned?.length
        ? [{ key: UNSET, label: "Unassigned", todos: unassigned }]
        : []),
    ];
  }

  if (group === "type") {
    const buckets = bucketBy(todos, (todo) => toWorkType(todo.type));

    return WORK_TYPE_OPTIONS.filter((type) => buckets.get(type)?.length).map(
      (type) => ({ key: type, label: type, todos: buckets.get(type) ?? [] }),
    );
  }

  const buckets = bucketBy(todos, (todo) => toPriority(todo.priority) ?? UNSET);

  const ranked = PRIORITY_OPTIONS.filter(
    (priority) => buckets.get(priority)?.length,
  ).map((priority) => ({
    key: priority,
    label: PRIORITIES[priority].label,
    todos: buckets.get(priority) ?? [],
  }));

  const unset = buckets.get(UNSET);

  return [
    ...ranked,
    ...(unset?.length
      ? [{ key: UNSET, label: "No priority", todos: unset }]
      : []),
  ];
}
