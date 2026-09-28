import type { SortKey } from "@/services/todos/view";

// The List's columns as data, not markup. Declaring them once is what lets the
// header, the cells and the Columns menu agree: a `lg:hidden` on a header cell
// and the matching one on a row cell were two places to change and two places
// to forget, which is the reason the old grid could not be made configurable.

export const LIST_COLUMN_IDS = [
  "work",
  "assignee",
  "reporter",
  "priority",
  "status",
  "due",
  "start",
  "estimate",
  "sprint",
  "parent",
  "created",
  "updated",
  "completed",
] as const;

export type ListColumnId = (typeof LIST_COLUMN_IDS)[number];

export interface ListColumnDef {
  id: ListColumnId;
  label: string;
  /** px. The elastic column reads this as a floor rather than a fixed track. */
  width: number;
  /** Takes the slack left over by the fixed columns — only the identity column does. */
  elastic?: boolean;
  align?: "center";
  /**
   * null where the field has no SORT_KEYS entry, and the header then offers no
   * sort affordance at all. Status, assignee, estimate and sprint are not
   * sortable in this app; an arrow that reordered nothing would be a lie.
   */
  sort: SortKey | null;
  /** Dropped entirely when boards.sprints_enabled is off, like every other sprint surface. */
  sprintsOnly?: boolean;
}

export const LIST_COLUMNS: Record<ListColumnId, ListColumnDef> = {
  // 320 is a floor, not a track: the column takes the slack on a wide screen,
  // so this only decides how much of a phone the identity column is allowed.
  work: { id: "work", label: "Work", width: 320, elastic: true, sort: "title" },
  assignee: { id: "assignee", label: "Assignee", width: 168, sort: null },
  reporter: { id: "reporter", label: "Reporter", width: 168, sort: null },
  priority: { id: "priority", label: "Priority", width: 120, sort: "priority" },
  status: { id: "status", label: "Status", width: 144, sort: null },
  due: { id: "due", label: "Due date", width: 132, sort: "due" },
  start: { id: "start", label: "Start date", width: 132, sort: null },
  estimate: {
    id: "estimate",
    label: "Estimate",
    width: 96,
    align: "center",
    sort: null,
  },
  sprint: {
    id: "sprint",
    label: "Sprint",
    width: 160,
    sort: null,
    sprintsOnly: true,
  },
  parent: { id: "parent", label: "Parent", width: 152, sort: null },
  created: { id: "created", label: "Created", width: 116, sort: "created" },
  updated: { id: "updated", label: "Updated", width: 116, sort: "updated" },
  completed: {
    id: "completed",
    label: "Completed",
    width: 124,
    sort: "completed",
  },
};

// Always first, never hidden: it carries the type, the key and the title, so a
// table without it is a grid of fields with nothing naming the row it belongs to.
// It is also the sticky column, and sticking a column that can move is a bug.
export const PINNED_COLUMN: ListColumnId = "work";

// Not in LIST_COLUMNS — the row menu is not a field and is not configurable.
// It is pinned to the right edge so a destructive action stays reachable while
// the fields are scrolled.
export const ACTION_COLUMN_WIDTH = 44;

// The row checkboxes. Like the action column, chrome rather than a field.
export const SELECT_COLUMN_WIDTH = 40;

export const DEFAULT_LIST_COLUMNS: readonly ListColumnId[] = [
  "work",
  "assignee",
  "reporter",
  "priority",
  "status",
  "due",
];

export function isListColumnId(value: unknown): value is ListColumnId {
  return (
    typeof value === "string" &&
    (LIST_COLUMN_IDS as readonly string[]).includes(value)
  );
}

// Anything stored can be stale: a column removed from the registry, a duplicate,
// or a list that lost the pinned one. Repairing on read means a bad entry costs
// a repaired table, never a crash or an empty one.
export function normalizeListColumns(ids: readonly unknown[]): ListColumnId[] {
  const seen = new Set<ListColumnId>([PINNED_COLUMN]);
  const columns: ListColumnId[] = [PINNED_COLUMN];

  for (const id of ids) {
    if (!isListColumnId(id) || seen.has(id)) continue;

    seen.add(id);
    columns.push(id);
  }

  return columns;
}

export function isDefaultListColumns(ids: readonly ListColumnId[]): boolean {
  return (
    ids.length === DEFAULT_LIST_COLUMNS.length &&
    ids.every((id, index) => id === DEFAULT_LIST_COLUMNS[index])
  );
}

// Enabling appends rather than slotting into registry order: once the order is
// the reader's to set, "where did it go?" is a worse answer than "on the end".
export function toggleListColumn(
  ids: readonly ListColumnId[],
  id: ListColumnId,
): ListColumnId[] {
  if (id === PINNED_COLUMN) return [...ids];

  return ids.includes(id)
    ? ids.filter((current) => current !== id)
    : [...ids, id];
}

// Swaps two named columns rather than moving one by an offset, because the stored
// list and the rendered list are not the same list: a column the sprints flag
// hides is still stored, so "one step left" counted over the stored array would
// step onto an invisible neighbour and appear to do nothing. The caller names the
// visible neighbour and this swaps their stored slots, which leaves every hidden
// entry exactly where it was.
export function swapListColumns(
  ids: readonly ListColumnId[],
  a: ListColumnId,
  b: ListColumnId,
): ListColumnId[] {
  const left = ids.indexOf(a);
  const right = ids.indexOf(b);

  // index 0 is the pinned column's slot, so nothing may move into or out of it
  if (left < 1 || right < 1 || left === right) return [...ids];

  const columns = [...ids];

  columns[left] = b;
  columns[right] = a;

  return columns;
}

export function resolveListColumns(
  ids: readonly ListColumnId[],
  { sprintsEnabled }: { sprintsEnabled: boolean },
): ListColumnDef[] {
  return ids
    .map((id) => LIST_COLUMNS[id])
    .filter((column) => sprintsEnabled || !column.sprintsOnly);
}

export function offeredListColumns({
  sprintsEnabled,
}: {
  sprintsEnabled: boolean;
}): ListColumnDef[] {
  return LIST_COLUMN_IDS.map((id) => LIST_COLUMNS[id]).filter(
    (column) => sprintsEnabled || !column.sprintsOnly,
  );
}

// What the table is set `min-width` to, which is what makes it scroll sideways
// instead of crushing its columns. The elastic column contributes its floor.
export function tableMinWidth(columns: readonly ListColumnDef[]): number {
  return columns.reduce(
    (total, column) => total + column.width,
    SELECT_COLUMN_WIDTH + ACTION_COLUMN_WIDTH,
  );
}

const KEY = "list:columns";

// Per-device, like the theme and the admin period: which fields you keep on
// screen is a habit of the person reading the board, not a fact about the work,
// so it is not worth a column on `boards` or a param in a shared URL.
//
// Guarded because localStorage throws rather than returning null in a private
// window with site data blocked, and the List must not fail to render over a
// remembered preference.
export function readListColumns(): ListColumnId[] {
  try {
    const stored = localStorage.getItem(KEY);

    if (stored === null) return [...DEFAULT_LIST_COLUMNS];

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed)) return [...DEFAULT_LIST_COLUMNS];

    return normalizeListColumns(parsed);
  } catch {
    return [...DEFAULT_LIST_COLUMNS];
  }
}

export function writeListColumns(ids: readonly ListColumnId[]): void {
  try {
    const columns = normalizeListColumns(ids);

    if (isDefaultListColumns(columns)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(columns));
  } catch {
    // A preference that cannot be remembered is not worth failing a render for.
  }
}
