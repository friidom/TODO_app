import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/useAuth";
import { useBoards } from "@/services/boards/useBoards";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { IBoard, Todo } from "@/types/data";
import {
  fetchAssignedTodos,
  fetchRecentTodos,
  fetchTodosByIds,
  fetchWorkedOn,
} from "./forYouApi";
import { mergeFeed, toFeedItems, type FeedItem, type ForYouTab } from "./feed";
import { readViewed } from "./viewed";

const EMPTY_BOARDS: IBoard[] = [];
const EMPTY_TODOS: Todo[] = [];

/**
 * The personal hub's data (M21).
 *
 * **Every query is declared unconditionally and gated by `enabled`**, which is
 * what the rules of hooks require and also what makes the page cheap: switching
 * tabs does not mount or unmount a query, it flips which one is allowed to run.
 * The three inactive tabs cost nothing, and a tab you return to is served from
 * cache rather than refetched — the client's 30s `staleTime` (see
 * `queryClient.ts`) covers a browse through all four.
 *
 * **The two-step tabs are a dependent pair, not a waterfall by accident.**
 * Worked on and Viewed each start from a list of ids — from the activity log,
 * from local storage — and the rows behind them come from one `in.(…)` query.
 * That second step is where RLS does its work: an id whose board the caller has
 * lost access to simply does not come back, so a stale local list disappears
 * with no client-side filtering and no way to get it wrong.
 */

/** The rows for one tab, already ordered, grouped-ready and board-named. */
export interface ForYouFeed {
  items: FeedItem[];
  isLoading: boolean;
  error: Error | null;
}

export function useForYouFeed(tab: ForYouTab): ForYouFeed {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: boards = EMPTY_BOARDS, isLoading: boardsLoading } = useBoards();

  /**
   * The viewed list, read once when the page mounts.
   *
   * `useState` with an initialiser rather than a `useMemo` or a bare call: this
   * is local storage, so re-reading and re-parsing it on every render would be
   * work for a value that only changes when you open a task — which navigates
   * away from this page and remounts it on the way back.
   */
  const [viewed] = useState(() => readViewed());

  // RECOMMENDED and ASSIGNED — one query each, filtered and sorted by Postgres.
  const recent = useQuery({
    queryKey: queryKeys.forYouRecent(),
    queryFn: () => fetchRecentTodos(),
    enabled: tab === "recommended",
  });

  const assigned = useQuery({
    queryKey: queryKeys.forYouAssigned(userId),
    queryFn: () => fetchAssignedTodos(userId!),
    // Recommended leans on this too — work assigned to you is the strongest
    // signal it has — so it runs for both tabs rather than being fetched twice
    // under two keys.
    enabled: Boolean(userId) && (tab === "assigned" || tab === "recommended"),
  });

  // WORKED ON — step one: the ids and the instants that date them.
  const workedOn = useQuery({
    queryKey: queryKeys.forYouWorkedOn(userId),
    queryFn: () => fetchWorkedOn(userId!),
    enabled: Boolean(userId) && tab === "workedon",
  });

  /**
   * Step two's input: which ids this tab needs rows for, and what dates them.
   *
   * One memo for both id-based tabs, because they differ only in where the map
   * came from. `viewed` is turned into the same `id -> instant` shape the
   * activity log already produces, so the resolution below has one code path.
   */
  const dated = useMemo((): Map<string, string> => {
    if (tab === "workedon") return workedOn.data ?? new Map();

    if (tab === "viewed") {
      return new Map(viewed.map((entry) => [entry.id, entry.at]));
    }

    return new Map();
  }, [tab, workedOn.data, viewed]);

  const ids = useMemo(() => [...dated.keys()], [dated]);

  const byIds = useQuery({
    queryKey: queryKeys.forYouByIds(ids),
    queryFn: () => fetchTodosByIds(ids),
    // Nothing to resolve is a legitimate answer — nothing worked on, nothing
    // viewed — and issuing `in.()` for it is a request PostgREST rejects.
    enabled: ids.length > 0,
  });

  const items = useMemo(() => {
    if (tab === "recommended") {
      // Assigned first, so a task that is both assigned to you and recently
      // touched keeps the reason you actually care about it. `mergeFeed`
      // de-duplicates on that basis and then sorts the union by recency, so
      // ordering is by time and only the *identity* of a row is decided here.
      return mergeFeed(
        toFeedItems(assigned.data ?? EMPTY_TODOS, boards),
        toFeedItems(recent.data ?? EMPTY_TODOS, boards),
      );
    }

    if (tab === "assigned") {
      return mergeFeed(toFeedItems(assigned.data ?? EMPTY_TODOS, boards));
    }

    // The id-based tabs. The row's own `updated_at` is not what dates it here —
    // when you worked on or viewed something is the question the tab is asking,
    // and that instant lives in the map rather than on the row.
    return mergeFeed(
      toFeedItems(
        byIds.data ?? EMPTY_TODOS,
        boards,
        (todo) => dated.get(todo.id) ?? todo.updated_at ?? todo.created_at,
      ),
    );
  }, [tab, assigned.data, recent.data, byIds.data, boards, dated]);

  // The step-one query for this tab, whichever it is. Its loading and error
  // states are the tab's until it has answered.
  const source = tab === "workedon" ? workedOn : null;

  const isLoading =
    boardsLoading ||
    (tab === "recommended" && (recent.isLoading || assigned.isLoading)) ||
    (tab === "assigned" && assigned.isLoading) ||
    (source?.isLoading ?? false) ||
    // Resolving rows for ids we already have. Not "loading" when there are no
    // ids — that is an empty tab, and it must render its empty state rather
    // than spin forever.
    (ids.length > 0 && byIds.isLoading);

  const error =
    (tab === "recommended" ? (recent.error ?? assigned.error) : null) ??
    (tab === "assigned" ? assigned.error : null) ??
    source?.error ??
    byIds.error ??
    null;

  return { items, isLoading, error };
}
