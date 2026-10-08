import { translated } from "@/components/i18n";
import { isDoneIn } from "@/services/workflow/statuses";
import type { Todo } from "@/types/data";

export const COLUMN_SIZES = ["fixed", "flexible"] as const;

export type ColumnSize = (typeof COLUMN_SIZES)[number];

export const SCROLL_MODES = ["columns", "board"] as const;

export type ScrollMode = (typeof SCROLL_MODES)[number];

// null is "never": nothing done is hidden, which is the board as it always was.
export const HIDE_DONE_DAYS = [1, 3, 7, 14, 30] as const;

export type HideDoneAfter = (typeof HIDE_DONE_DAYS)[number] | null;

// Only what a board card can show from data the board already holds. Development, labels and flags would each need a
// request or a column the board does not load, so they are not offered.
export const CARD_FIELDS = [
  "summary",
  "key",
  "type",
  "priority",
  "estimate",
  "due",
  "subtasks",
  "assignee",
  "parent",
  "sprint",
] as const;

export type CardField = (typeof CARD_FIELDS)[number];

export const CARD_FIELD_LABELS = translated<CardField>({
  summary: "fields.title",
  key: "viewSettings.workItemKey",
  type: "fields.workType",
  priority: "fields.priority",
  estimate: "task.storyPoints",
  due: "fields.dueDate",
  subtasks: "subtasks.title",
  assignee: "fields.assignee",
  parent: "fields.parent",
  sprint: "fields.sprint",
});

// Everything a card showed before the setting existed, so the default changes nothing.
export const DEFAULT_CARD_FIELDS: readonly CardField[] = [
  "summary",
  "key",
  "type",
  "priority",
  "estimate",
  "due",
  "subtasks",
  "assignee",
];

export interface BoardViewPrefs {
  columnSize: ColumnSize;
  scroll: ScrollMode;
  hideDoneAfter: HideDoneAfter;
  cardFields: CardField[];
}

export const DEFAULT_BOARD_VIEW_PREFS: BoardViewPrefs = {
  columnSize: "fixed",
  scroll: "columns",
  hideDoneAfter: null,
  cardFields: [...DEFAULT_CARD_FIELDS],
};

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

// Always in the declared order, so a stored array cannot reorder the card.
function inCardOrder(ids: readonly unknown[]): CardField[] {
  return CARD_FIELDS.filter((id) => ids.includes(id));
}

export function normalizeBoardViewPrefs(raw: unknown): BoardViewPrefs {
  const source =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};

  return {
    columnSize: pick(
      source.columnSize,
      COLUMN_SIZES,
      DEFAULT_BOARD_VIEW_PREFS.columnSize,
    ),
    scroll: pick(source.scroll, SCROLL_MODES, DEFAULT_BOARD_VIEW_PREFS.scroll),
    hideDoneAfter: HIDE_DONE_DAYS.includes(
      source.hideDoneAfter as (typeof HIDE_DONE_DAYS)[number],
    )
      ? (source.hideDoneAfter as HideDoneAfter)
      : null,
    cardFields: Array.isArray(source.cardFields)
      ? inCardOrder(source.cardFields)
      : [...DEFAULT_CARD_FIELDS],
  };
}

export function toggleCardField(
  fields: readonly CardField[],
  id: CardField,
): CardField[] {
  return fields.includes(id)
    ? fields.filter((field) => field !== id)
    : inCardOrder([...fields, id]);
}

export function isDefaultBoardViewPrefs(prefs: BoardViewPrefs): boolean {
  return (
    prefs.columnSize === DEFAULT_BOARD_VIEW_PREFS.columnSize &&
    prefs.scroll === DEFAULT_BOARD_VIEW_PREFS.scroll &&
    prefs.hideDoneAfter === null &&
    prefs.cardFields.length === DEFAULT_CARD_FIELDS.length &&
    prefs.cardFields.every((field) => DEFAULT_CARD_FIELDS.includes(field))
  );
}

// Done for longer than `days` whole days, judged by completed_at. Returns the same array when nothing goes, so the
// board's memos downstream hold. A done card without completed_at stays: there is nothing to judge it by.
export function hideStaleDone(
  todos: Todo[],
  days: HideDoneAfter,
  doneStatuses: ReadonlySet<string>,
  today: string,
): Todo[] {
  if (days === null) return todos;

  const cutoff = Date.parse(`${today}T00:00:00Z`) - days * 86_400_000;

  const kept = todos.filter((todo) => {
    if (!isDoneIn(todo, doneStatuses) || todo.completed_at === null)
      return true;

    const doneAt = Date.parse(todo.completed_at);

    return Number.isNaN(doneAt) || doneAt >= cutoff;
  });

  return kept.length === todos.length ? todos : kept;
}

const KEY = "board:view-prefs";

// Per-device for the reason toolbar:controls is: how wide a column is and where the board scrolls are reading
// habits, not facts about the board. Guarded because a private window throws on access rather than returning null.
export function readBoardViewPrefs(): BoardViewPrefs {
  try {
    const stored = localStorage.getItem(KEY);

    if (stored === null) return normalizeBoardViewPrefs(null);

    return normalizeBoardViewPrefs(JSON.parse(stored));
  } catch {
    return normalizeBoardViewPrefs(null);
  }
}

export function writeBoardViewPrefs(prefs: BoardViewPrefs): void {
  try {
    const next = normalizeBoardViewPrefs(prefs);

    if (isDefaultBoardViewPrefs(next)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A preference that cannot be remembered is not worth failing a render for.
  }
}
