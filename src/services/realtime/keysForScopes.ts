import { queryKeys } from "@/services/queryClient/queryKeys";

// The server's coarse `board:invalidate` names scopes, not keys — it has no
// business knowing the client's cache layout. This is the one place the two
// vocabularies meet, and the resync after a reconnect goes through it too so
// there is a single definition of "what does this board's cache consist of".
export type Scope =
  | "todos"
  | "columns"
  | "comments"
  | "attachments"
  | "sprints"
  | "members"
  | "boards";

export const ALL_SCOPES: Scope[] = [
  "todos",
  "columns",
  "comments",
  "attachments",
  "sprints",
  "members",
  "boards",
];

// comments and attachments are keyed by todo, not by board, so the whole
// family is invalidated rather than a key this function cannot construct.
function keysFor(scope: Scope, boardId: string | undefined): readonly unknown[][] {
  switch (scope) {
    case "todos":
      return [[...queryKeys.todos(boardId)]];
    case "columns":
      return [[...queryKeys.columns(boardId)]];
    case "comments":
      return [[...queryKeys.commentThreads()]];
    case "attachments":
      return [["attachments"]];
    case "sprints":
      return [[...queryKeys.sprints(boardId)]];
    case "members":
      return [[...queryKeys.members(boardId)]];
    case "boards":
      return [[...queryKeys.board(boardId)], [...queryKeys.boards()]];
    // Reachable despite the union: a newer server may name a scope this build
    // has never heard of.
    default:
      return [];
  }
}

export function keysForScopes(
  scopes: readonly Scope[],
  boardId: string | undefined,
): unknown[][] {
  const seen = new Set<string>();
  const keys: unknown[][] = [];

  for (const scope of scopes) {
    for (const key of keysFor(scope, boardId)) {
      const fingerprint = JSON.stringify(key);

      if (seen.has(fingerprint)) continue;

      seen.add(fingerprint);
      keys.push([...key]);
    }
  }

  return keys;
}
