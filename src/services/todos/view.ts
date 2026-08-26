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

/**
 * Filtering, sorting and grouping, as pure functions over the board array.
 *
 * Beside the feature they serve and outside any hook, like cache.ts and
 * limitBreach.ts, for the same two reasons: they're the part worth testing, and
 * both views need them. The board and the list run this identical pipeline —
 * filter, sort, group — so the two can't disagree about what "assigned to me, by
 * due date" means.
 *
 * None of it touches the database. todos.position stays exactly as the user
 * dragged it, whatever this file is asked to show, and sortTodos under "manual"
 * is the identity function, which is what makes switching back free.
 *
 * Everything takes the already-loaded array and returns a new one; nothing
 * re-queries.
 */

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** The dimensions a board can be narrowed by. Each is independent of the others. */
export const FILTER_CATEGORIES = [
  "assignee",
  "type",
  "priority",
  "due",
  "status",
] as const;

export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

/**
 * What each category is called on screen. Here rather than in the panel, beside
 * SORT_LABELS and GROUP_LABELS: a control's vocabulary belongs with the values
 * it names, so a new category is a compile error until it has a label.
 */
export const FILTER_LABELS: Record<FilterCategory, string> = {
  assignee: "Assignee",
  status: "Status",
  type: "Work type",
  priority: "Priority",
  due: "Due date",
};

/**
 * The selected values per category.
 *
 * An empty array means the category is off, not that it excludes everything.
 * That's the only reading that makes a filter panel usable: unchecking your last
 * work type should show every card again, not none.
 */
export type TodoFilters = Record<FilterCategory, string[]>;

export const EMPTY_FILTERS: TodoFilters = {
  assignee: [],
  type: [],
  priority: [],
  due: [],
  status: [],
};

/** The pseudo-value for "no value set", used by assignee, priority and due date. */
export const UNSET = "none";

/** The assignee pseudo-value that resolves to whoever is looking. */
export const ME = "me";

/** Where a due date sits, plus the case of not having one. */
export const DUE_BUCKETS = ["none", "overdue", "today", "upcoming"] as const;

export type DueBucket = (typeof DUE_BUCKETS)[number];

export const DUE_LABELS: Record<DueBucket, string> = {
  none: "No due date",
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Upcoming",
};

/** How many values are selected across every category — the badge on the button. */
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

    // `me` is resolved here rather than stored, so a shared URL means "assigned
    // to whoever opened it" — which is what the option says.
    if (value === ME)
      return !!currentUserId && todo.assignee_id === currentUserId;

    return todo.assignee_id === value;
  });
}

function matchesType(todo: Todo, selected: string[]) {
  if (!selected.length) return true;

  // Normalised through `toWorkType`, so a row holding a value the CHECK
  // constraint no longer allows is filtered as the default rather than
  // disappearing from every selection.
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

  // The card's own chip reads its colour from this same call, so a card the
  // "Overdue" filter keeps is exactly a card wearing the overdue tone.
  return selected.includes(dueStatus(todo.due_date, today));
}

function matchesStatus(todo: Todo, selected: string[]) {
  if (!selected.length) return true;

  return todo.column_id !== null && selected.includes(todo.column_id);
}

/**
 * The cards that survive every active category.
 *
 * AND between categories, OR within one. "Bug or Story, assigned to me" is what
 * a filter panel is asked; "Bug and Story" would always be empty.
 *
 * Returns the input array itself when nothing is filtered, so an unfiltered
 * board hands the same reference to useMemo downstream and re-renders nothing.
 */
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

/**
 * A query that names a work item by its key: `KAN-12`, `ops-7`, or just `12`.
 *
 * The prefix is captured and thrown away. It belongs to the board
 * (boards.key_prefix) and a view may span several boards with different
 * prefixes, so matching on the number works in every scope. Typing `KAN-12` on
 * an `OPS` board and finding `OPS-12` is generous and never wrong; the
 * alternative is a search that fails because you remembered the number but not
 * the prefix.
 *
 * The prefix group is optional, so this also matches a bare number — see
 * searchTodos for why the two are then treated differently.
 */
const KEY_QUERY = /^\s*(?:([a-z][a-z0-9]*)-)?(\d+)\s*$/i;

/** Runs of whitespace collapse, so `fix  login` matches `fix login`. */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The cards matching a free-text query. Three shapes, chosen by the query rather
 * than by a toggle:
 *
 * - `KAN-12`, `ops-7` — a prefixed key. Key only: writing the prefix is an
 *   explicit statement that you mean the key.
 * - `12` — a bare number. Key OR title, unioned. This one used to be key-only,
 *   so on a board whose cards are titled `123`, `3231` and `123123` — which is
 *   what this project's own board holds — typing `123` returned nothing while
 *   three matching cards sat on screen.
 * - anything else — a case-insensitive substring of the title.
 *
 * Titles only: the board query doesn't fetch `description`, so there's nothing
 * here to search. A description search is a server-side query or a widened
 * select, not a free extension of this function.
 *
 * Returns the input array when the query is empty, same reference rule as
 * filterTodos.
 */
export function searchTodos(todos: Todo[], query: string): Todo[] {
  const needle = normalise(query);

  if (!needle) return todos;

  const key = KEY_QUERY.exec(needle);

  if (key) {
    const [, prefix, digits] = key;
    const number = Number(digits);

    // A prefixed key is unambiguous: the user named a card.
    if (prefix) return todos.filter((todo) => todo.board_key === number);

    // A bare number is not. One pass, so the result stays in the order it
    // arrived — the pipeline sorts afterwards and a concatenation of two
    // filtered arrays would not.
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

/**
 * How each key is named in the menu, the trigger, and the hint strip explaining
 * why dragging is off. One map rather than three, so the reason the board gives
 * can't name a sort differently from the menu that set it.
 */
export const SORT_LABELS: Record<SortKey, string> = {
  manual: "Manual",
  due: "Due date",
  created: "Created",
  updated: "Updated",
  priority: "Priority",
  title: "Title",
};

/**
 * What a card is worth under one sort key, or null when it has no answer.
 *
 * Due dates compare as `YYYY-MM-DD` strings, which works because the format is
 * fixed-width and big-endian — the reason dueDate.ts slices rather than parses.
 * Priority compares by rank, never by spelling.
 */
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

/**
 * The cards in view order. Never written back.
 *
 * `manual` returns the input untouched — not a copy, not a re-sort — so the
 * board's stored order survives a round trip through the sort control and
 * byRank stays the only thing that decides it.
 *
 * Cards with no value sort last in both directions: a card with no due date
 * isn't the most overdue one, and flipping to descending shouldn't promote every
 * unanswered card to the top. Sort is stable, so ties keep their board order.
 */
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

/**
 * The board's own order as one flat list: columns left to right, position top to
 * bottom inside each.
 *
 * This is what `manual` means, and it has to be stated once. The cache doesn't
 * hold it — applyTodoMoved returns `[...untouched, ...source, ...destination]`,
 * so array order stops matching board order the first time anything is dragged.
 * Both views used to reconstruct it separately, which was two implementations of
 * one rule and only one of them would get fixed.
 *
 * Applied in useVisibleTodos, so the array both views render is already in
 * display order and neither sorts again.
 */
export function orderByBoard(todos: Todo[], columns: IColumn[]): Todo[] {
  const rank = new Map(
    columns
      .slice()
      .sort(byRank)
      .map((column, index) => [column.id, index]),
  );

  // A card whose column is missing sorts to the end rather than to the front,
  // where a `-1` would have put it.
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

/**
 * Grouping the board can render as swimlanes.
 *
 * `status` is missing on purpose, and so is `none`: the columns already are the
 * statuses, so grouping by status is the identity and produces the board that
 * was already there.
 */
export function isSwimlaneGroup(group: GroupKey): boolean {
  return group !== "none" && group !== "status";
}

export interface TodoGroup {
  /**
   * Identifies the group and decorates it: a column id under `status`, a profile
   * id under `assignee`, a WorkType or Priority otherwise, and UNSET for cards
   * with no value. The renderer knows which dimension is active, so it can look
   * up a dot or an avatar without the group carrying one.
   */
  key: string;
  label: string;
  todos: Todo[];
}

export interface GroupContext {
  columns: IColumn[];
  members: BoardMember[];
}

/** The single group an ungrouped view is, so callers have one shape to render. */
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

/**
 * The cards split along one dimension, in an order that means something.
 *
 * Runs last, on the already-filtered and already-sorted array, so grouping
 * composes with both rather than competing: each group holds the cards that
 * survived the filter, in the order the sort put them.
 *
 * Empty groups are dropped, except under `status`. A lane for an assignee with
 * no cards is whitespace saying nothing; an empty column is part of the board
 * whether or not anything is in it.
 */
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

    // A card whose column was deleted out from under it would otherwise vanish
    // from a list that claims to show everything.
    const orphans = buckets.get(UNSET);

    if (orphans?.length) {
      groups.push({ key: UNSET, label: "No status", todos: orphans });
    }

    return groups;
  }

  if (group === "assignee") {
    const buckets = bucketBy(todos, (todo) => todo.assignee_id ?? UNSET);

    // memberName rather than a second `full_name || username` chain — the
    // roster's display rules live in one place. It sits under components/ only
    // because react-refresh can't handle a module mixing a component with other
    // exports; it's a pure function.
    const named = members
      .filter((member) => buckets.has(member.id))
      .map((member) => ({
        key: member.id,
        label: memberName(member),
        todos: buckets.get(member.id) ?? [],
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // Assigned to somebody the roster no longer lists — `assignee_id` survives a
    // removal from the board (`on delete set null` only fires when the profile
    // itself goes). Their cards still belong somewhere.
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
      // Last deliberately: it is the group people scan past, not the one they
      // are looking for.
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
    // The constants own the wording; the levels are stored lowercase and shown
    // capitalised, and doing that here would be a second answer to the question.
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
