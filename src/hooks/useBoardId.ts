import { useParams } from "react-router";

/**
 * The board currently being viewed, read from `/boards/:boardId`.
 *
 * The URL is the single source of truth for which board is open — there is no
 * provider mirroring it into context and no state to keep in step. A tab is
 * already a complete description of what it is showing, so a shared link, a
 * refresh and the back button all work without anything being restored.
 *
 * Returns the raw param, which may be absent or malformed: a route param is
 * user input. Callers that are about to query with it should screen it through
 * `isUuid` first.
 *
 * From M2-11 this is what every board-scoped query key is built from.
 */
export function useBoardId(): string | undefined {
  const { boardId } = useParams<{ boardId: string }>();

  return boardId;
}
