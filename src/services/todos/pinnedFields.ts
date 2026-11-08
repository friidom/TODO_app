const KEY = "task:pinned-fields";

const keyFor = (userId: string) => `${KEY}:${userId}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

// Per person and per device, like the details cards' collapsed state: which
// fields someone keeps at the top is a reading habit, not the task's data.
export function readPinnedFields(
  userId: string | undefined,
  store: Storage | null = storage(),
): string[] {
  if (!userId || !store) return [];

  try {
    const parsed: unknown = JSON.parse(store.getItem(keyFor(userId)) ?? "[]");

    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed.filter((it): it is string => typeof it === "string"),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

export function writePinnedFields(
  userId: string | undefined,
  keys: string[],
  store: Storage | null = storage(),
): void {
  if (!userId || !store) return;

  try {
    store.setItem(keyFor(userId), JSON.stringify(keys));
  } catch {
    // still applied for this visit
  }
}

export function togglePinned(keys: string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((it) => it !== key) : [...keys, key];
}

// A pinned field moves rather than duplicates. A key for a field this task does
// not show (a subtask's sprint, say) is skipped, not dropped from storage.
export function partitionFields<T extends { key: string }>(
  fields: T[],
  pinned: string[],
): { pinned: T[]; rest: T[] } {
  const byKey = new Map(fields.map((field) => [field.key, field]));

  return {
    pinned: pinned.flatMap((key) => byKey.get(key) ?? []),
    rest: fields.filter((field) => !pinned.includes(field.key)),
  };
}
