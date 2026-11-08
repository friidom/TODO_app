// localStorage only — per-browser, ids only (never titles, so a revoked board just resolves to nothing instead of leaking a cached name)

const KEY = "kan:viewed";

const BOARDS_KEY = "kan:recent-boards";

// keyed per user, so a second account on this browser never sees the first's history
const keyFor = (base: string, userId: string) => `${base}:${userId}`;

// trimmed on write, so the resolving `in.(…)` query stays bounded
export const VIEWED_LIMIT = 50;

export const BOARD_VISITS_LIMIT = 20;

export interface ViewedEntry {
  id: string;
  boardId: string;
  at: string;
}

export interface BoardVisit {
  id: string;
  at: string;
  view?: string;
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

  dropLegacy(storage);

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

// The pre-per-user keys are only navigation history, so dropping them loses nothing worth keeping.
function dropLegacy(storage: Storage) {
  try {
    storage.removeItem(KEY);
    storage.removeItem(BOARDS_KEY);
  } catch {
    // a browser refusing access is already handled by the read that follows
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
    typeof visit.at === "string" &&
    (visit.view === undefined || typeof visit.view === "string")
  );
}

export function readViewed(
  userId: string | undefined,
  storage: Storage | null = defaultStorage(),
): ViewedEntry[] {
  if (!userId) return [];

  return readList(storage, keyFor(KEY, userId), isEntry, VIEWED_LIMIT);
}

// moves the entry to the front rather than appending, so reopening a card doesn't create a second entry
export function recordView(
  userId: string | undefined,
  id: string,
  boardId: string,
  at: string,
  storage: Storage | null = defaultStorage(),
): ViewedEntry[] {
  if (!userId) return [];

  const next = [
    { id, boardId, at },
    ...readViewed(userId, storage).filter((entry) => entry.id !== id),
  ].slice(0, VIEWED_LIMIT);

  writeList(storage, keyFor(KEY, userId), next);

  return next;
}

export function clearViewed(
  userId: string | undefined,
  storage: Storage | null = defaultStorage(),
): void {
  if (!userId) return;

  try {
    storage?.removeItem(keyFor(KEY, userId));
  } catch {
    // same as above
  }
}

export function readBoardVisits(
  userId: string | undefined,
  storage: Storage | null = defaultStorage(),
): BoardVisit[] {
  if (!userId) return [];

  return readList(
    storage,
    keyFor(BOARDS_KEY, userId),
    isVisit,
    BOARD_VISITS_LIMIT,
  );
}

export function recordBoardVisit(
  userId: string | undefined,
  id: string,
  at: string,
  view?: string,
  storage: Storage | null = defaultStorage(),
): BoardVisit[] {
  if (!userId) return [];

  const visit: BoardVisit = view ? { id, at, view } : { id, at };
  const next = [
    visit,
    ...readBoardVisits(userId, storage).filter((it) => it.id !== id),
  ].slice(0, BOARD_VISITS_LIMIT);

  writeList(storage, keyFor(BOARDS_KEY, userId), next);

  return next;
}
