import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";
import { DEFAULT_KEY_PREFIX } from "@/utils/taskKey";

/**
 * The prefix this board's task keys are labelled with (M14).
 *
 * Three components render a key and none of them should each be deciding where
 * the prefix comes from. `useBoard` is a cached query the board page has
 * already resolved, so this is a cache read rather than a request — the same
 * property `BoardMeta` relies on for its counts.
 *
 * **The fallback is defensive, not a real state.** `key_prefix` is `NOT NULL`
 * in the schema, and `BoardPage` returns `<Loading />` until this exact query
 * settles, so no card renders before the board is in cache. It exists so a card
 * rendered outside that gate — a future surface, a test — degrades to the
 * default rather than to `undefined-12`.
 */
export function useKeyPrefix(): string {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);

  return board?.key_prefix ?? DEFAULT_KEY_PREFIX;
}
