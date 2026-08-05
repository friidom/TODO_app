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
  /** Every todo on the board as one flat array — not one entry per column. */
  todos: () => ["todos"] as const,

  columns: () => ["columns"] as const,

  /** Prefix covering every profile entry; matches them all when invalidating. */
  profiles: () => PROFILE_ROOT,

  profile: (userId: string | undefined) => [...PROFILE_ROOT, userId] as const,
};
