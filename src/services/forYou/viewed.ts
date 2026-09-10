// localStorage only — per-browser, ids only (never titles, so a revoked board just resolves to nothing via RLS instead of leaking a cached name)

const KEY = "kan:viewed";

// trimmed on write, so the resolving `in.(…)` query stays bounded
export const VIEWED_LIMIT = 50;

export interface ViewedEntry {
  id: string;
  boardId: string;
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
export function readViewed(
  storage: Storage | null = defaultStorage(),
): ViewedEntry[] {
  if (!storage) return [];

  let raw: string | null;

  try {
    raw = storage.getItem(KEY);
  } catch {
    return [];
  }

  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isEntry).slice(0, VIEWED_LIMIT);
  } catch {
    return [];
  }
}

function isEntry(value: unknown): value is ViewedEntry {
  if (typeof value !== "object" || value === null) return false;

  const entry = value as Record<string, unknown>;

  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.boardId === "string" &&
    typeof entry.at === "string"
  );
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

  if (storage) {
    try {
      storage.setItem(KEY, JSON.stringify(next));
    } catch {
      // quota or a browser refusing to persist — not worth a toast
    }
  }

  return next;
}

export function clearViewed(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // same as above
  }
}
