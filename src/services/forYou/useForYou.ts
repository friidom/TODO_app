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

// All four tabs' queries are declared unconditionally and gated by `enabled` — switching tabs flips which one runs, it doesn't mount/unmount.
export interface ForYouFeed {
  items: FeedItem[];
  isLoading: boolean;
  error: Error | null;
}

export function useForYouFeed(tab: ForYouTab): ForYouFeed {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: boards = EMPTY_BOARDS, isLoading: boardsLoading } = useBoards();

  // read once on mount — local storage, and this page remounts whenever a task navigates away and back
  const [viewed] = useState(() => readViewed());

  const recent = useQuery({
    queryKey: queryKeys.forYouRecent(),
    queryFn: () => fetchRecentTodos(),
    enabled: tab === "recommended",
  });

  const assigned = useQuery({
    queryKey: queryKeys.forYouAssigned(userId),
    queryFn: () => fetchAssignedTodos(userId!),
    // recommended reuses this rather than fetching assigned work twice under two keys
    enabled: Boolean(userId) && (tab === "assigned" || tab === "recommended"),
  });

  const workedOn = useQuery({
    queryKey: queryKeys.forYouWorkedOn(userId),
    queryFn: () => fetchWorkedOn(userId!),
    enabled: Boolean(userId) && tab === "workedon",
  });

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
    // an empty id list is a legit answer (nothing worked on/viewed) — PostgREST rejects an empty in.()
    enabled: ids.length > 0,
  });

  const items = useMemo(() => {
    if (tab === "recommended") {
      // assigned first, so a task both assigned and recently touched keeps "assigned" as its reason
      return mergeFeed(
        toFeedItems(assigned.data ?? EMPTY_TODOS, boards),
        toFeedItems(recent.data ?? EMPTY_TODOS, boards),
      );
    }

    if (tab === "assigned") {
      return mergeFeed(toFeedItems(assigned.data ?? EMPTY_TODOS, boards));
    }

    // dated by when you worked on/viewed it, not the row's updated_at
    return mergeFeed(
      toFeedItems(
        byIds.data ?? EMPTY_TODOS,
        boards,
        (todo) => dated.get(todo.id) ?? todo.updated_at ?? todo.created_at,
      ),
    );
  }, [tab, assigned.data, recent.data, byIds.data, boards, dated]);

  const source = tab === "workedon" ? workedOn : null;

  const isLoading =
    boardsLoading ||
    (tab === "recommended" && (recent.isLoading || assigned.isLoading)) ||
    (tab === "assigned" && assigned.isLoading) ||
    (source?.isLoading ?? false) ||
    // not "loading" with zero ids — that's an empty tab and should render its empty state
    (ids.length > 0 && byIds.isLoading);

  const error =
    (tab === "recommended" ? (recent.error ?? assigned.error) : null) ??
    (tab === "assigned" ? assigned.error : null) ??
    source?.error ??
    byIds.error ??
    null;

  return { items, isLoading, error };
}
