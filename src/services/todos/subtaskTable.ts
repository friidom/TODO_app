import { translated } from "@/components/i18n";
import { priorityRank } from "@/constants/priorities";
import { doneStatusIds, isDoneIn } from "@/services/workflow/statuses";
import type { IStatus, Todo } from "@/types/data";

// The Work column is not here: it names the row, so it is always shown and cannot be configured away.
export const SUBTASK_COLUMN_IDS = [
  "priority",
  "assignee",
  "status",
  "estimate",
  "due",
] as const;

export type SubtaskColumnId = (typeof SUBTASK_COLUMN_IDS)[number];

export const SUBTASK_COLUMN_LABELS = translated<SubtaskColumnId>({
  priority: "fields.priority",
  assignee: "fields.assignee",
  status: "fields.status",
  estimate: "fields.estimate",
  due: "fields.dueDate",
});

export const DEFAULT_SUBTASK_COLUMNS: readonly SubtaskColumnId[] = [
  "priority",
  "assignee",
  "status",
];

export const SUBTASK_SORTS = ["created", "priority", "status"] as const;

export type SubtaskSort = (typeof SUBTASK_SORTS)[number];

export interface SubtaskTablePrefs {
  columns: SubtaskColumnId[];
  hideDone: boolean;
  sort: SubtaskSort;
}

export const DEFAULT_SUBTASK_TABLE: SubtaskTablePrefs = {
  columns: [...DEFAULT_SUBTASK_COLUMNS],
  hideDone: false,
  sort: "created",
};

// Always in the declared order: that is the order the table lays them out in, so a stored array cannot reorder it.
function inTableOrder(ids: readonly unknown[]): SubtaskColumnId[] {
  return SUBTASK_COLUMN_IDS.filter((id) => ids.includes(id));
}

export function normalizeSubtaskTable(raw: unknown): SubtaskTablePrefs {
  const source =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};

  return {
    columns: Array.isArray(source.columns)
      ? inTableOrder(source.columns)
      : [...DEFAULT_SUBTASK_COLUMNS],
    hideDone: source.hideDone === true,
    sort: SUBTASK_SORTS.includes(source.sort as SubtaskSort)
      ? (source.sort as SubtaskSort)
      : DEFAULT_SUBTASK_TABLE.sort,
  };
}

export function toggleSubtaskColumn(
  columns: readonly SubtaskColumnId[],
  id: SubtaskColumnId,
): SubtaskColumnId[] {
  return columns.includes(id)
    ? columns.filter((column) => column !== id)
    : inTableOrder([...columns, id]);
}

export function isDefaultSubtaskColumns(
  columns: readonly SubtaskColumnId[],
): boolean {
  return (
    columns.length === DEFAULT_SUBTASK_COLUMNS.length &&
    columns.every((id, index) => id === DEFAULT_SUBTASK_COLUMNS[index])
  );
}

export function isDefaultSubtaskTable(prefs: SubtaskTablePrefs): boolean {
  return (
    !prefs.hideDone &&
    prefs.sort === DEFAULT_SUBTASK_TABLE.sort &&
    isDefaultSubtaskColumns(prefs.columns)
  );
}

const WORK_MIN_REM = 12;

const COLUMN_REM: Record<SubtaskColumnId, number> = {
  priority: 7,
  assignee: 9,
  status: 8,
  estimate: 4.5,
  due: 7,
};

// The row's side padding (px-3) and the gap between tracks (gap-x-2), in rem.
const ROW_PADDING_REM = 1.5;
const GAP_REM = 0.5;

// Work takes the slack; the rest are fixed tracks. minWidth is what the table is allowed to shrink to before it scrolls
// sideways, which is the narrow task panel's case.
export function subtaskGrid(columns: readonly SubtaskColumnId[]): {
  template: string;
  minWidth: string;
} {
  const tracks = columns.map((id) => `${COLUMN_REM[id]}rem`);
  const fixed = columns.reduce((total, id) => total + COLUMN_REM[id], 0);
  const min = WORK_MIN_REM + fixed + GAP_REM * columns.length + ROW_PADDING_REM;

  return {
    template: [`minmax(${WORK_MIN_REM}rem,1fr)`, ...tracks].join(" "),
    minWidth: `${min}rem`,
  };
}

function byCreation(a: Todo, b: Todo): number {
  return (
    (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
    a.id.localeCompare(b.id)
  );
}

// statuses arrive in board order, so the position in the array is the position on the board
export function arrangeSubtasks(
  subtasks: readonly Todo[],
  prefs: Pick<SubtaskTablePrefs, "hideDone" | "sort">,
  statuses: IStatus[],
): Todo[] {
  const done = doneStatusIds(statuses);

  const shown = prefs.hideDone
    ? subtasks.filter((subtask) => !isDoneIn(subtask, done))
    : [...subtasks];

  if (prefs.sort === "priority") {
    return shown.sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) || byCreation(a, b),
    );
  }

  if (prefs.sort === "status") {
    const position = new Map(
      statuses.map((status, index) => [status.id, index]),
    );

    const at = (todo: Todo) =>
      (todo.status_id !== null ? position.get(todo.status_id) : undefined) ??
      statuses.length;

    return shown.sort((a, b) => at(a) - at(b) || byCreation(a, b));
  }

  return shown.sort(byCreation);
}

const KEY = "subtasks:table";

// Per-device, guarded, and removed once it is back to the default — the same idiom as toolbar:controls.
export function readSubtaskTable(): SubtaskTablePrefs {
  try {
    const stored = localStorage.getItem(KEY);

    if (stored === null) return normalizeSubtaskTable(undefined);

    return normalizeSubtaskTable(JSON.parse(stored));
  } catch {
    return normalizeSubtaskTable(undefined);
  }
}

export function writeSubtaskTable(prefs: SubtaskTablePrefs): void {
  try {
    const next = normalizeSubtaskTable(prefs);

    if (isDefaultSubtaskTable(next)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A preference that cannot be remembered is not worth failing a render for.
  }
}
