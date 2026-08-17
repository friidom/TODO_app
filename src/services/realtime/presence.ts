/**
 * Who is looking at this board right now (M6-11).
 *
 * **Presence is not persisted and touches no cache.** It lives in the channel
 * and nowhere else: no table, no query key, no write path, and no fallback to
 * the member roster — a member with the tab closed is not present. The plan
 * asks for
 * "who is viewing the board, via the presence channel", and anything durable
 * would be a second, slower answer to a question whose whole value is that it is
 * live — plus a row to clean up after every crashed tab.
 *
 * Pure, so the reduction from Supabase's presence state to a list of people is
 * testable without a socket.
 */

/** What each client tracks about itself. Nothing but identity and when. */
export interface PresenceMeta {
  user_id: string;
  at: string;
}

/**
 * Supabase's presence state, structurally.
 *
 * Keyed by presence key — this channel uses the user's id, so two tabs from one
 * person collapse into one entry rather than showing them twice. Each key holds
 * an array because a key *can* have several connections; the reduction below
 * does not care how many.
 */
export type PresenceState = Record<string, PresenceMeta[]>;

/**
 * **Everyone** currently connected to this board, by user id, in a stable order.
 *
 * **Self is included, and excluding it was the bug.** The first version filtered
 * the viewer out on the theory that "who else is here" was the question — which
 * made the list read one short of the truth in every case and, with two people
 * on a board, made A see exactly one avatar (B) and B see exactly one (A). Both
 * clients were working perfectly and both looked broken, because a roster that
 * silently omits you cannot be checked against what you can see.
 *
 * The list is the presence state and nothing else: a user appears here because
 * their socket is on this channel, and disappears when it goes. It is never
 * derived from the board's membership — a member with the tab closed is not
 * present, and presence is not a permission.
 *
 * Sorted by id rather than by arrival: presence state has no reliable ordering
 * across clients, and a list that reshuffles as people's sockets reconnect would
 * make avatars swap places for no reason anyone can see. No entry is special —
 * the viewer takes their place in that order like everyone else.
 */
export function viewersFrom(state: PresenceState): string[] {
  const ids = new Set<string>();

  for (const entries of Object.values(state)) {
    // A key can hold several connections — the same person in two tabs — and
    // the Set is what makes that one avatar rather than two.
    for (const entry of entries) {
      if (entry?.user_id) ids.add(entry.user_id);
    }
  }

  return [...ids].sort();
}
