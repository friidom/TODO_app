import i18n from "@/components/i18n";
import type { SortKey } from "@/services/todos/view";
import { reorder, type Side } from "@/utils/reorder";

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
  /** The default width in px, until the reader drags it. The elastic column reads it as a floor. */
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
  work: {
    id: "work",
    get label() {
      return i18n.t("fields.work");
    },
    width: 320,
    elastic: true,
    sort: "title",
  },
  assignee: {
    id: "assignee",
    get label() {
      return i18n.t("fields.assignee");
    },
    width: 168,
    sort: null,
  },
  reporter: {
    id: "reporter",
    get label() {
      return i18n.t("fields.reporter");
    },
    width: 168,
    sort: null,
  },
  priority: {
    id: "priority",
    get label() {
      return i18n.t("fields.priority");
    },
    width: 120,
    sort: "priority",
  },
  status: {
    id: "status",
    get label() {
      return i18n.t("fields.status");
    },
    width: 144,
    sort: null,
  },
  due: {
    id: "due",
    get label() {
      return i18n.t("fields.dueDate");
    },
    width: 132,
    sort: "due",
  },
  start: {
    id: "start",
    get label() {
      return i18n.t("fields.startDate");
    },
    width: 132,
    sort: null,
  },
  estimate: {
    id: "estimate",
    get label() {
      return i18n.t("fields.estimate");
    },
    width: 96,
    align: "center",
    sort: null,
  },
  sprint: {
    id: "sprint",
    get label() {
      return i18n.t("fields.sprint");
    },
    width: 160,
    sort: null,
    sprintsOnly: true,
  },
  parent: {
    id: "parent",
    get label() {
      return i18n.t("fields.parent");
    },
    width: 152,
    sort: null,
  },
  created: {
    id: "created",
    get label() {
      return i18n.t("fields.created");
    },
    width: 116,
    sort: "created",
  },
  updated: {
    id: "updated",
    get label() {
      return i18n.t("fields.updated");
    },
    width: 116,
    sort: "updated",
  },
  completed: {
    id: "completed",
    get label() {
      return i18n.t("fields.completed");
    },
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

// The row checkboxes and the grip a row is dragged by. Like the action column,
// chrome rather than a field. Sized for the grip whether or not rows can be
// dragged, so sorting the List does not shift every column sideways.
export const SELECT_COLUMN_WIDTH = 52;

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

// Moves within the stored list, not the rendered one: a column the sprints flag
// hides is still stored, and working on the stored list is what leaves it
// exactly where it was. Nothing may land in or leave the pinned column's slot.
export function moveListColumn(
  ids: readonly ListColumnId[],
  activeId: ListColumnId,
  overId: ListColumnId,
  side: Side,
): ListColumnId[] {
  if (activeId === PINNED_COLUMN) return [...ids];

  const columns = reorder(ids, activeId, overId, side);

  return columns[0] === PINNED_COLUMN ? columns : [...ids];
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

export type ListColumnWidths = Partial<Record<ListColumnId, number>>;

export const MIN_COLUMN_WIDTH = 80;
export const MIN_PINNED_COLUMN_WIDTH = 200;
export const MAX_COLUMN_WIDTH = 800;

export function minListColumnWidth(id: ListColumnId): number {
  return id === PINNED_COLUMN ? MIN_PINNED_COLUMN_WIDTH : MIN_COLUMN_WIDTH;
}

export function clampListColumnWidth(id: ListColumnId, width: number): number {
  return Math.round(
    Math.min(MAX_COLUMN_WIDTH, Math.max(minListColumnWidth(id), width)),
  );
}

export function listColumnWidth(
  column: ListColumnDef,
  widths: ListColumnWidths,
): number {
  return widths[column.id] ?? column.width;
}

// A width equal to the default is dropped rather than stored, so a column
// dragged back to where it started does not count as customised.
export function withListColumnWidth(
  widths: ListColumnWidths,
  id: ListColumnId,
  width: number | null,
): ListColumnWidths {
  const next = { ...widths };
  const clamped = width === null ? null : clampListColumnWidth(id, width);

  if (clamped === null || clamped === LIST_COLUMNS[id].width) delete next[id];
  else next[id] = clamped;

  return next;
}

export function normalizeListColumnWidths(value: unknown): ListColumnWidths {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  let widths: ListColumnWidths = {};

  for (const [id, width] of Object.entries(value)) {
    if (!isListColumnId(id)) continue;
    if (typeof width !== "number" || !Number.isFinite(width)) continue;

    widths = withListColumnWidth(widths, id, width);
  }

  return widths;
}

// What the table is set `min-width` to, which is what makes it scroll sideways
// instead of crushing its columns. The elastic column contributes its floor.
export function tableMinWidth(
  columns: readonly ListColumnDef[],
  widths: ListColumnWidths = {},
): number {
  return columns.reduce(
    (total, column) => total + listColumnWidth(column, widths),
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

// A key of its own rather than a field beside the ids, so a list stored before
// widths existed still reads as it was written.
const WIDTHS_KEY = "list:column-widths";

// Per board, because a board's titles and fields are what a width is fitted
// to. A board with no widths of its own reads the ones stored before widths
// were per board, so nobody's resized columns reset on upgrade.
export function readListColumnWidths(boardId?: string): ListColumnWidths {
  try {
    const own = boardId
      ? localStorage.getItem(`${WIDTHS_KEY}:${boardId}`)
      : null;
    const stored = own ?? localStorage.getItem(WIDTHS_KEY);

    return stored === null ? {} : normalizeListColumnWidths(JSON.parse(stored));
  } catch {
    return {};
  }
}

export function writeListColumnWidths(
  widths: ListColumnWidths,
  boardId?: string,
): void {
  try {
    const repaired = normalizeListColumnWidths(widths);

    // A board keeps even an empty set, so resetting it to the defaults does
    // not bring the shared widths back.
    if (boardId) {
      localStorage.setItem(
        `${WIDTHS_KEY}:${boardId}`,
        JSON.stringify(repaired),
      );
    } else if (Object.keys(repaired).length === 0) {
      localStorage.removeItem(WIDTHS_KEY);
    } else {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify(repaired));
    }
  } catch {
    // see writeListColumns
  }
}
