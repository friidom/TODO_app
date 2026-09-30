import i18n, { translated } from "@/components/i18n";
import { memberName } from "@/components/members/memberLabels";
import {
  PRIORITIES,
  PRIORITY_OPTIONS,
  priorityRank,
  toPriority,
} from "@/constants/priorities";
import {
  WORK_TYPE_LABELS,
  WORK_TYPE_OPTIONS,
  toWorkType,
} from "@/constants/workTypes";
import type { BoardMember } from "@/services/members/membersApi";
import { columnIdOf, type WorkflowModel } from "@/services/workflow/statuses";
import type { IStatus, Todo } from "@/types/data";
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

export const FILTER_LABELS = translated<FilterCategory>({
  assignee: "fields.assignee",
  status: "fields.status",
  type: "fields.workType",
  priority: "fields.priority",
  due: "fields.dueDate",
});

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

export const DUE_LABELS = translated<DueBucket>({
  none: "due.none",
  overdue: "due.overdue",
  today: "due.today",
  upcoming: "due.upcoming",
});

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

  return todo.status_id !== null && selected.includes(todo.status_id);
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
  // Sortable since completed_at joined the list projection for the predefined
  // filters. Cards that are not done have no value and sort last, both ways.
  "completed",
  "priority",
  "title",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export const SORT_LABELS = translated<SortKey>({
  manual: "sort.manual",
  due: "fields.dueDate",
  created: "fields.created",
  updated: "fields.updated",
  completed: "fields.completed",
  priority: "fields.priority",
  title: "fields.title",
});

// due dates compare fine as plain YYYY-MM-DD strings since the format is fixed-width and big-endian
function sortValue(todo: Todo, key: SortKey): string | number | null {
  switch (key) {
    case "due":
      return todo.due_date;
    case "created":
      return todo.created_at;
    case "updated":
      return todo.updated_at;
    case "completed":
      return todo.completed_at;
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

// columns left to right, position top to bottom — the cache's own array order doesn't match this once anything's been dragged.
// A card's column is its status's, and cards of different statuses in one column interleave by rank, as they do on the board.
export function orderByBoard(
  todos: Todo[],
  workflow: Pick<WorkflowModel, "columns" | "statusById">,
): Todo[] {
  const rank = new Map(
    workflow.columns
      .slice()
      .sort(byRank)
      .map((column, index) => [column.id, index]),
  );

  // a card with no status, or one this board does not know, sorts to the end, not the front
  const of = (todo: Todo) =>
    rank.get(columnIdOf(todo, workflow.statusById) ?? "") ??
    Number.MAX_SAFE_INTEGER;

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

export const GROUP_LABELS = translated<GroupKey>({
  none: "group.none",
  status: "fields.status",
  assignee: "fields.assignee",
  type: "fields.workType",
  priority: "fields.priority",
});

// status and none are excluded — the board already is a grouping by status, through the columns that show them
export function isSwimlaneGroup(group: GroupKey): boolean {
  return group !== "none" && group !== "status";
}

export interface TodoGroup {
  key: string;
  label: string;
  todos: Todo[];
}

export interface GroupContext {
  // Board order.
  statuses: IStatus[];
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

// runs on the already-filtered, already-sorted array; empty groups drop, except a visible status (it can still receive work).
// A hidden status appears only while it still holds work.
export function groupTodos(
  todos: Todo[],
  group: GroupKey,
  { statuses, members }: GroupContext,
): TodoGroup[] {
  if (group === "none") return [{ key: ALL, label: "", todos }];

  if (group === "status") {
    const known = new Set(statuses.map((status) => status.id));
    const buckets = bucketBy(todos, (todo) =>
      todo.status_id !== null && known.has(todo.status_id)
        ? todo.status_id
        : UNSET,
    );

    const groups: TodoGroup[] = statuses
      .filter((status) => !status.is_hidden || buckets.has(status.id))
      .map((status) => ({
        key: status.id,
        label: status.name,
        todos: buckets.get(status.id) ?? [],
      }));

    const orphans = buckets.get(UNSET);

    if (orphans?.length) {
      groups.push({
        key: UNSET,
        label: i18n.t("status.none"),
        todos: orphans,
      });
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
        label: i18n.t("members.former"),
        todos: buckets.get(key) ?? [],
      }));

    const unassigned = buckets.get(UNSET);

    return [
      ...named,
      ...former,
      ...(unassigned?.length
        ? [
            {
              key: UNSET,
              label: i18n.t("members.unassigned"),
              todos: unassigned,
            },
          ]
        : []),
    ];
  }

  if (group === "type") {
    const buckets = bucketBy(todos, (todo) => toWorkType(todo.type));

    return WORK_TYPE_OPTIONS.filter((type) => buckets.get(type)?.length).map(
      (type) => ({
        key: type,
        label: WORK_TYPE_LABELS[type],
        todos: buckets.get(type) ?? [],
      }),
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
      ? [{ key: UNSET, label: i18n.t("priority.none"), todos: unset }]
      : []),
  ];
}
