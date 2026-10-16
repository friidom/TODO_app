// localStorage only — per-browser, ids only (never titles, so a revoked board just resolves to nothing via RLS instead of leaking a cached name)

const KEY = "kan:viewed";

const BOARDS_KEY = "kan:recent-boards";

// trimmed on write, so the resolving `in.(…)` query stays bounded
export const VIEWED_LIMIT = 50;

export const BOARD_VISITS_LIMIT = 8;

export interface ViewedEntry {
  id: string;
  boardId: string;
  at: string;
}

export interface BoardVisit {
  id: string;
  at: string;
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

// everything re-validated, never trusted — it's the user's own browser storage, so a hand-edited value shouldn't crash the page
function readList<T>(
  storage: Storage | null,
  key: string,
  isItem: (value: unknown) => value is T,
  limit: number,
): T[] {
  if (!storage) return [];

  let raw: string | null;

  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }

  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isItem).slice(0, limit);
  } catch {
    return [];
  }
}

function writeList(storage: Storage | null, key: string, list: unknown[]) {
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(list));
  } catch {
    // quota or a browser refusing to persist — not worth a toast
  }
}

function fieldsOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function isEntry(value: unknown): value is ViewedEntry {
  const entry = fieldsOf(value);

  return (
    entry !== null &&
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.boardId === "string" &&
    typeof entry.at === "string"
  );
}

function isVisit(value: unknown): value is BoardVisit {
  const visit = fieldsOf(value);

  return (
    visit !== null &&
    typeof visit.id === "string" &&
    visit.id.length > 0 &&
    typeof visit.at === "string"
  );
}

export function readViewed(
  storage: Storage | null = defaultStorage(),
): ViewedEntry[] {
  return readList(storage, KEY, isEntry, VIEWED_LIMIT);
}

// moves the entry to the front rather than appending, so reopening a card doesn't create a second entry
export function recordView(
  id: string,
  boardId: string,
  at: string,
  storage: Storage | null = defaultStorage(),
): ViewedEntry[] {
  const next = [
    { id, boardId, at },
    ...readViewed(storage).filter((entry) => entry.id !== id),
  ].slice(0, VIEWED_LIMIT);

  writeList(storage, KEY, next);

  return next;
}

export function clearViewed(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // same as above
  }
}

export function readBoardVisits(
  storage: Storage | null = defaultStorage(),
): BoardVisit[] {
  return readList(storage, BOARDS_KEY, isVisit, BOARD_VISITS_LIMIT);
}

export function recordBoardVisit(
  id: string,
  at: string,
  storage: Storage | null = defaultStorage(),
): BoardVisit[] {
  const next = [
    { id, at },
    ...readBoardVisits(storage).filter((visit) => visit.id !== id),
  ].slice(0, BOARD_VISITS_LIMIT);

  writeList(storage, BOARDS_KEY, next);

  return next;
}
