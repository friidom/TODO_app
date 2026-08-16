import { useQuery } from "@tanstack/react-query";

import { fetchActivities } from "./activitiesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * One board's activity, fetched only while the drawer is open (M18).
 *
 * `enabled` is the point, as it is for `useTodo`: the feed is a panel most
 * people never open, and a board load should not pay for it. Closing the drawer
 * unmounts the caller, the query goes idle and `gcTime` drops the entry.
 *
 * **No mutation invalidates this, and that is a deliberate gap.** The log is
 * written by database triggers, so the client cannot know an entry appeared —
 * moving a card patches the todos cache optimistically and the server writes an
 * activity row the client never sees. Making every mutation invalidate the feed
 * would be a refetch on every drag for a panel that is usually closed.
 *
 * What closes the gap properly is M6-B: the feed is a realtime subscription's
 * natural shape, and an append-only table is the easiest thing realtime has to
 * handle. Until then the drawer refetches when it opens, which is when someone
 * is actually looking, and the `staleTime` below is what stops it refetching on
 * every focus change while they read.
 */
export function useActivities(boardId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.activities(boardId),
    queryFn: () => {
      if (!boardId) throw new Error("useActivities ran without a board");

      return fetchActivities(boardId);
    },
    enabled: Boolean(boardId) && enabled,
    // Shorter than the client's 30s default. A feed is the one query here whose
    // value is its freshness, and it is only ever mounted while someone is
    // reading it.
    staleTime: 10_000,
  });
}
