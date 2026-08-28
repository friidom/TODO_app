// The one place a query key is spelled out. Every hook imports from here, so
// the shape of a key changes in this file instead of in a grep across a dozen
// call sites.
//
// Keys are returned from functions, not held as constants, so a caller can't
// mutate one that another query is already keyed by.

const PROFILE_ROOT = ["profile"] as const;

const COMMENT_ROOT = ["comments"] as const;

const FOR_YOU_ROOT = ["for-you"] as const;

const NOTIFICATION_ROOT = ["notifications"] as const;

export const queryKeys = {
  /**
   * Every todo on one board as a flat array, not one entry per column.
   *
   * boardId stays required even though it may be undefined: that's what turns
   * "find every place that reads the board" into a compile error rather than a
   * grep. undefined is a real state (the route param before it resolves) and it
   * keys an entry whose query is disabled, so it never fills.
   */
  todos: (boardId: string | undefined) => ["todos", boardId] as const,

  columns: (boardId: string | undefined) => ["columns", boardId] as const,

  /** Every sprint on one board (M30) — board-scoped like `columns`, and read
   * by the Backlog view, Sprint Details, and the Task Detail Sprint field
   * alike, the same "one cache, many views" shape `todos` already has. */
  sprints: (boardId: string | undefined) => ["sprints", boardId] as const,

  /** Every board the user can reach. Not board-scoped — it is the index. */
  boards: () => ["boards"] as const,

  /**
   * The caller's own spaces. No argument, for the same reason `boards()` has
   * none: a space belongs to a person and RLS returns only theirs.
   *
   * Deliberately not a child of `boards()` — the sidebar reads both, and
   * invalidating the board list must not throw away the folders it groups them
   * under.
   */
  spaces: () => ["spaces"] as const,

  /**
   * One board's own row. `["board", id]` rather than a child of `boards()`:
   * invalidating the list must not throw away each board's detail entry, and
   * the two are fetched independently.
   */
  board: (boardId: string | undefined) => ["board", boardId] as const,

  /**
   * One board's roster, as returned by the `board_roster` RPC.
   *
   * Named for the concept rather than the table: the data never comes from
   * `board_members`, which is self-read only and would return exactly one row.
   */
  members: (boardId: string | undefined) => ["members", boardId] as const,

  /**
   * One board's pending invitations.
   *
   * Holds only what the list query returns — accepted and expired invites are
   * filtered out before they reach the cache, so this is "what can still be
   * copied or revoked" rather than every invite row that exists.
   */
  invites: (boardId: string | undefined) => ["invites", boardId] as const,

  /**
   * Autocomplete results for the invite field.
   *
   * Keyed by the query text as well as the board, so each search is its own
   * entry and typing backwards re-reads the cache instead of the network.
   * Short-lived by nature, which is why `useCreateInvite` invalidates the
   * prefix below.
   */
  inviteeSearch: (boardId: string | undefined, query: string) =>
    ["invitee-search", boardId, query] as const,

  /** Prefix covering every cached search for one board, for invalidation. */
  inviteeSearches: (boardId: string | undefined) =>
    ["invitee-search", boardId] as const,

  /**
   * Invitations addressed to the signed-in user. Not board-scoped: it's the
   * cross-board question "what am I being asked to join".
   */
  myInvites: () => ["my-invites"] as const,

  /**
   * One board's activity history.
   *
   * Deliberately not a child of `todos(boardId)`: the log outlives the rows it
   * describes, so invalidating the board's cards must not throw away the record
   * of what happened to them.
   *
   * Nothing invalidates this entry today — the table is trigger-written, so no
   * client mutation knows an entry appeared. `useActivities` explains why that
   * gap is left rather than papered over with a refetch per drag.
   */
  activities: (boardId: string | undefined) => ["activities", boardId] as const,

  /**
   * One work item's own history (M25).
   *
   * Its own root rather than a filtered read of `activities(boardId)`: the two
   * are separate queries over separate scopes, so they are separate entries.
   *
   * **Unlike its board-scoped sibling, this one is invalidated** — by
   * `useUpdateTodo` and `useTodoDrop`, the only mutations that change a
   * `todos` row. Either can run while the History tab is open, and a tab that
   * never refreshes after the edit it is showing is the gap M18 exists to
   * avoid.
   */
  todoActivities: (todoId: string | undefined) =>
    ["todo-activities", todoId] as const,

  /**
   * One work item's complete row, for the detail panel.
   *
   * Its own entry rather than a slice of `todos(boardId)`, which holds only the
   * twelve columns the board reads. Keying it separately is what lets the full
   * row be fetched when the panel opens and dropped when it closes, instead of
   * widening every card on the board to serve one of them.
   */
  todo: (todoId: string | undefined) => ["todo", todoId] as const,

  /**
   * One work item's comment thread. Keyed by the work item, not the board, for
   * the same reason as `todo(todoId)`: the thread is fetched when a task opens
   * and dropped when it closes, and a board-scoped entry would mean holding
   * every thread on the board to render one. A work item id belongs to exactly
   * one board, so nothing collides.
   */
  comments: (todoId: string | undefined) => [...COMMENT_ROOT, todoId] as const,

  /**
   * Prefix covering every comment thread in the cache.
   *
   * It exists for one reason: a realtime DELETE payload is the primary key and
   * nothing else, so the thread a removed comment belonged to has to be *found*
   * rather than read off the row. This is what the realtime handler matches on.
   */
  commentThreads: () => COMMENT_ROOT,

  /**
   * The personal hub's entries.
   *
   * Not board-scoped, and that's the whole shape of this page. Every other key
   * here answers "what is on this board"; these answer "what is mine", across
   * every board RLS lets the caller reach. Keying them by board would be
   * meaningless — the query has no board filter, because the policy already is
   * one.
   *
   * Under one root so the page's whole cache drops with a single prefix
   * invalidation, rather than enumerating four entries at a call site that
   * would then have to be kept in step with the tabs.
   *
   * `recent` takes no argument for the same reason `boards()` doesn't. The rest
   * carry the user id explicitly, so signing in as somebody else on the same tab
   * can't read the previous person's feed out of the cache.
   */
  forYou: () => FOR_YOU_ROOT,

  forYouRecent: () => [...FOR_YOU_ROOT, "recent"] as const,

  forYouAssigned: (userId: string | undefined) =>
    [...FOR_YOU_ROOT, "assigned", userId] as const,

  forYouWorkedOn: (userId: string | undefined) =>
    [...FOR_YOU_ROOT, "worked-on", userId] as const,

  /**
   * Work items resolved from a list of ids — Worked on and Viewed both end here.
   *
   * Keyed by the ids themselves, sorted and joined, so the entry changes exactly
   * when the set does and two tabs asking for the same rows share one request.
   * Sorted because the *set* is the question; the caller re-orders afterwards.
   */
  forYouByIds: (ids: string[]) =>
    [...FOR_YOU_ROOT, "by-ids", [...ids].sort().join(",")] as const,

  /**
   * The caller's inbox and its unread count. Not board-scoped, like the For You
   * keys and for the same reason.
   *
   * Under one root so marking something read drops the list and the badge
   * together — they're two views of one table and must never disagree about it.
   */
  notifications: () => NOTIFICATION_ROOT,

  notificationList: () => [...NOTIFICATION_ROOT, "list"] as const,

  notificationUnread: () => [...NOTIFICATION_ROOT, "unread"] as const,

  /** Prefix covering every profile entry; matches them all when invalidating. */
  profiles: () => PROFILE_ROOT,

  profile: (userId: string | undefined) => [...PROFILE_ROOT, userId] as const,

  /**
   * Whether one username is free.
   *
   * Neither board- nor user-scoped, because the question isn't: a username is
   * unique across the product and the answer is the same for whoever is asking,
   * including the signed-out visitor on the registration form.
   *
   * Keyed by the *normalised* name, so `Ada` and `ada` share one cache entry and
   * one request, exactly as they share one row in `profiles`.
   */
  usernameAvailability: (username: string) =>
    ["username-availability", username] as const,
};
