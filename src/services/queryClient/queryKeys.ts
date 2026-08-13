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

  /** Prefix covering every profile entry; matches them all when invalidating. */
  profiles: () => PROFILE_ROOT,

  profile: (userId: string | undefined) => [...PROFILE_ROOT, userId] as const,
};
