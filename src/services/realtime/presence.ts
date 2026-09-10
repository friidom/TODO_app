// Lives entirely in the channel — no table, no cache, no fallback to the roster. A closed tab is simply not present.

export interface PresenceMeta {
  user_id: string;
  at: string;
}

// keyed by presence key (the user's id here), each holding an array since one person can have several tabs open
export type PresenceState = Record<string, PresenceMeta[]>;

// self is included on purpose — excluding it used to make a 2-person board show each person exactly one avatar, not two
export function viewersFrom(state: PresenceState): string[] {
  const ids = new Set<string>();

  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      if (entry?.user_id) ids.add(entry.user_id);
    }
  }

  // sorted rather than by arrival order — presence has no stable cross-client ordering, so this avoids avatars reshuffling on reconnect
  return [...ids].sort();
}

// guards against re-rendering the whole board on every presence heartbeat, which fires far more often than the roster actually changes
export function sameViewers(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  return a.every((id, index) => id === b[index]);
}
