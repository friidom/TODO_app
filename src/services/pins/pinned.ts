export const MAX_PINS = 5;

const isPinned = <T extends { pinned_at?: string | null }>(item: T) =>
  Boolean(item.pinned_at);

// Newest pin first, at most MAX_PINS of each: the server caps pins, this caps
// what the block draws if a stale cache ever holds more.
export function pinnedItems<T extends { pinned_at?: string | null }>(
  items: T[],
): T[] {
  return items
    .filter(isPinned)
    .sort((a, b) => b.pinned_at!.localeCompare(a.pinned_at!))
    .slice(0, MAX_PINS);
}

export function pinnedCount(items: { pinned_at?: string | null }[]): number {
  return items.filter(isPinned).length;
}

export function applyPinned<
  T extends { id: string; pinned_at?: string | null },
>(items: T[], id: string, pinned: boolean, now: string): T[] {
  return items.map((item) =>
    item.id === id ? { ...item, pinned_at: pinned ? now : null } : item,
  );
}
