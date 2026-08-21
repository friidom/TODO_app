// The one place a query key is spelled out.
//
// Every hook imports from here, so the shape of a key can change in this file
// instead of in a grep across a dozen call sites. That is what M2 needs: the
// board-scoped keys become `todos(boardId)` / `columns(boardId)` by adding the
// argument here and letting the compiler point at every caller.
//
// Keys are returned from functions, not held as constants, so a caller cannot
// mutate one that another query is already keyed by.

const PROFILE_ROOT = ["profile"] as const;

const COMMENT_ROOT = ["comments"] as const;

const FOR_YOU_ROOT = ["for-you"] as const;

export const queryKeys = {
  /**
   * Every todo on one board as a flat array — not one entry per column.
   *
   * `boardId` is a required argument even though it may be undefined. That is
   * the point: making it required is what turned "find every place that reads
   * the board" into a compiler error rather than a grep. Undefined is a real
   * state — the route param before it resolves — and it keys an entry the
   * matching query is disabled for, so it never fills.
   */
  todos: (boardId: string | undefined) => ["todos", boardId] as const,

  columns: (boardId: string | undefined) => ["columns", boardId] as const,

  /** Every board the user can reach. Not board-scoped — it is the index. */
  boards: () => ["boards"] as const,

  /**
   * The caller's own spaces (M15).
   *
   * Takes no argument for the same reason `boards()` does not: a space belongs
   * to a person, and RLS returns only theirs. It is deliberately not a child of
   * `boards()` — the sidebar reads both, and invalidating the board list must
   * not throw away the folders it groups them under.
   */
  spaces: () => ["spaces"] as const,

  /**
   * One board's own row. Deliberately `["board", id]` rather than a child of
   * `boards()`, per docs/API.md — invalidating the list must not throw away
   * each board's detail entry, and the two are fetched independently.
   */
  board: (boardId: string | undefined) => ["board", boardId] as const,

  /**
   * One board's roster, as returned by the `board_roster` RPC.
   *
   * Board-scoped like `todos`/`columns`, and named for the concept rather than
   * the table: the data never comes from `board_members`, which is self-read
   * only and would return exactly one row.
   */
  members: (boardId: string | undefined) => ["members", boardId] as const,

  /**
   * One board's pending invitations.
   *
   * Board-scoped like `members`, and it holds only what the list query returns
   * — accepted and expired invites are filtered out before they reach the
   * cache (M4-07), so this entry is "what can still be copied or revoked"
   * rather than every invite row that exists.
   */
  invites: (boardId: string | undefined) => ["invites", boardId] as const,

  /**
   * Autocomplete results for the invite field (M4-08).
   *
   * Keyed by the query text as well as the board, so each distinct search is
   * its own entry and typing backwards re-reads the cache instead of the
   * network. Short-lived by nature — the roster it describes changes the moment
   * an invite is sent, which is why `useCreateInvite` invalidates the prefix.
   */
  inviteeSearch: (boardId: string | undefined, query: string) =>
    ["invitee-search", boardId, query] as const,

  /** Prefix covering every cached search for one board, for invalidation. */
  inviteeSearches: (boardId: string | undefined) =>
    ["invitee-search", boardId] as const,

  /**
   * Invitations addressed to the signed-in user (M4-08).
   *
   * Not board-scoped — it is the cross-board question "what am I being asked to
   * join", and the answer is keyed to the person, not to any one board.
   */
  myInvites: () => ["my-invites"] as const,

  /**
   * One board's activity history (M18).
   *
   * Board-scoped like `members` and `invites`, and deliberately **not** a child
   * of `todos(boardId)`: the log outlives the rows it describes, so
   * invalidating the board's cards must not throw away the record of what
   * happened to them.
   *
   * Nothing invalidates this entry today — the table is trigger-written, so no
   * client mutation knows an entry appeared. `useActivities` explains why that
   * gap is left for M6-B rather than papered over with a refetch per drag.
   */
  activities: (boardId: string | undefined) => ["activities", boardId] as const,

  /**
   * One work item's complete row, for the detail panel (M5-06).
   *
   * Deliberately its own entry rather than a slice of `todos(boardId)`: that
   * one holds the twelve columns the board reads (M5-07), and the panel is the
   * only screen that needs `description`. Keying it separately is what lets the
   * full row be fetched when the panel opens and dropped when it closes,
   * instead of widening every card on the board to serve one of them.
   */
  todo: (todoId: string | undefined) => ["todo", todoId] as const,

  /**
   * One work item's comment thread (M7-02).
   *
   * **Keyed by the work item, not the board**, which is the shape M7-02
   * specifies and the same reasoning `todo(todoId)` above follows: the thread
   * is fetched when a task opens and dropped when it closes, and a board-scoped
   * entry would mean holding every thread on the board to render one of them.
   * A work item id belongs to exactly one board, so nothing collides.
   */
  comments: (todoId: string | undefined) => [...COMMENT_ROOT, todoId] as const,

  /**
   * Prefix covering every comment thread in the cache (M7-04).
   *
   * Shaped like `profiles()` above, and it exists for one reason: a realtime
   * DELETE payload is the primary key and nothing else, so the thread a
   * removed comment belonged to has to be *found* rather than read off the
   * row. This is what the realtime handler matches on to search them.
   */
  commentThreads: () => COMMENT_ROOT,

  /**
   * The personal hub's entries (M21).
   *
   * **Not board-scoped, and that is the whole shape of this page.** Every other
   * key here answers "what is on this board"; these answer "what is mine",
   * across every board RLS lets the caller reach. Keying them by board would be
   * meaningless — the query has no board filter, because the policy already is
   * one.
   *
   * Under one `["for-you", …]` root so the page's whole cache can be dropped
   * with a single prefix invalidation, rather than enumerating four entries at
   * a call site that would then have to be kept in step with the tabs.
   *
   * `recent` takes no argument for the same reason `boards()` does not — the
   * answer is already the caller's own, decided by RLS rather than by a filter
   * this key could name. The rest carry the user id explicitly, so signing in
   * as somebody else on the same tab cannot read the previous person's feed out
   * of the cache.
   */
  forYou: () => FOR_YOU_ROOT,

  forYouRecent: () => [...FOR_YOU_ROOT, "recent"] as const,

  forYouAssigned: (userId: string | undefined) =>
    [...FOR_YOU_ROOT, "assigned", userId] as const,

  forYouWorkedOn: (userId: string | undefined) =>
    [...FOR_YOU_ROOT, "worked-on", userId] as const,

  /**
   * Work items resolved from a list of ids — Worked on and Viewed both end in
   * one of these.
   *
   * Keyed by the ids themselves, sorted and joined, so the entry changes
   * exactly when the set does and two tabs asking for the same rows share one
   * request. Sorted because the *set* is the question; the caller re-orders by
   * its own timestamps afterwards.
   */
  forYouByIds: (ids: string[]) =>
    [...FOR_YOU_ROOT, "by-ids", [...ids].sort().join(",")] as const,

  /** Prefix covering every profile entry; matches them all when invalidating. */
  profiles: () => PROFILE_ROOT,

  profile: (userId: string | undefined) => [...PROFILE_ROOT, userId] as const,

  /**
   * Whether one username is free (M10-01).
   *
   * Not board-scoped and not user-scoped, because the question is not: a
   * username is unique across the product, and the answer is the same for
   * whoever is asking — including the signed-out visitor on the registration
   * form, who is the main caller.
   *
   * Keyed by the *normalised* name, so `Ada` and `ada` share one cache entry
   * and one request, exactly as they share one row in `profiles`.
   */
  usernameAvailability: (username: string) =>
    ["username-availability", username] as const,
};
