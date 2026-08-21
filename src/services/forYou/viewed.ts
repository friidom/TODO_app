/**
 * Recently viewed work items (M21).
 *
 * **In `localStorage`, and that is a deliberate ceiling rather than a shortcut.**
 * The brief asks for the smallest sensible implementation where no viewed-history
 * infrastructure exists, and none does. The server-side alternative is a
 * `todo_views` table written on *every* task open — a row per navigation, on a
 * table with no natural bound, to power one tab. That is the speculative schema
 * the brief rules out, and the write amplification is real: opening ten cards
 * while reading a board would be ten inserts.
 *
 * What this costs, stated plainly: **the list is per-browser.** Viewing a task
 * on a laptop does not put it in the phone's Viewed tab, and clearing site data
 * clears it. That is the same contract a browser's own history has, which is
 * why it is a defensible answer for this particular question and would not be
 * for "assigned to me".
 *
 * **It stores ids, never titles.** A cached title would go stale the moment
 * somebody renamed the card, and — the part that matters — a work item you have
 * since lost access to would keep rendering its name out of the browser's own
 * storage, with no server round trip to stop it. Ids are resolved through
 * `fetchTodosByIds`, so RLS decides what comes back and a revoked board simply
 * yields nothing. Local storage can be stale; it cannot leak.
 *
 * Pure over an injected `Storage`, so the boundary cases — a full quota, a
 * private window that throws on read, a hand-edited value — are testable
 * without a browser.
 */

const KEY = "kan:viewed";

/**
 * How many to keep.
 *
 * Enough to cover "what was I just looking at" across a session and small
 * enough that the resolving `in.(…)` stays one short query. The list is trimmed
 * on write, so the stored value cannot grow without bound however long the
 * browser keeps it.
 */
export const VIEWED_LIMIT = 50;

export interface ViewedEntry {
  id: string;
  /** Kept so a stale entry can be dropped without a round trip if needed. */
  boardId: string;
  /** ISO instant of the most recent view. */
  at: string;
}

/**
 * `localStorage` where it exists, and nothing where it does not.
 *
 * SSR has no `window`; a private window can have the property present and throw
 * on access. Both are "no history", which is a legitimate state — not an error
 * worth surfacing on a page the user merely opened.
 */
function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The stored list, newest first.
 *
 * Every field is re-validated rather than trusted. This value is user-writable
 * — it is their own browser — so a hand-edited or half-written entry must
 * produce an empty list, not a crash on a page that has nothing to do with it.
 */
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

/**
 * Record a view, and return the new list.
 *
 * **Moves rather than appends.** Opening a card you looked at this morning
 * makes it the most recent view, not a second one — so the existing entry is
 * removed and re-added at the front. That is what keeps the list a set of work
 * items ordered by recency instead of a log of navigations, and it is why the
 * cap can be as small as it is.
 *
 * A failed write is swallowed. Storage can be full or blocked, and a viewed
 * list that could not be saved is worth exactly nothing compared to the task
 * the user was actually opening.
 */
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
      // Quota, or a browser refusing to persist. Not worth a toast.
    }
  }

  return next;
}

/** Forget everything. Exists for the profile page's future "clear history". */
export function clearViewed(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Same as above: an unwritable store is not an error to report.
  }
}
