import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/services/api/supabase";
import { useAuth } from "@/services/auth/useAuth";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Comment, IColumn, Todo } from "@/types/data";
import {
  applyColumnEvent,
  applyCommentEvent,
  applyTodoEvent,
  type RowChange,
} from "./events";
import {
  sameViewers,
  viewersFrom,
  type PresenceMeta,
  type PresenceState,
} from "./presence";

// One channel per board. INSERT/UPDATE are filtered server-side; DELETE isn't, because these tables are REPLICA IDENTITY DEFAULT
// and a delete payload only carries the primary key — a board_id filter would never match. Unfiltered, the handler just checks if it has the row.
export function useBoardRealtime(boardId: string | undefined): string[] {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [viewers, setViewers] = useState<string[]>([]);

  const userId = user?.id;

  useEffect(() => {
    if (!boardId || !userId) return;

    const todosKey = queryKeys.todos(boardId);
    const columnsKey = queryKeys.columns(boardId);

    // Skip the write if the cache entry doesn't exist yet — a fresh one holding one row would look like a fully loaded board.
    function patchTodos(change: RowChange<Todo>) {
      queryClient.setQueryData<Todo[]>(todosKey, (old) =>
        old ? applyTodoEvent(old, change) : old,
      );
    }

    function patchColumns(change: RowChange<IColumn>) {
      queryClient.setQueryData<IColumn[]>(columnsKey, (old) =>
        old ? applyColumnEvent(old, change) : old,
      );
    }

    // Comments ride the board channel rather than a per-task one, so opening/closing tasks never subscribes anything.
    function patchComments(change: RowChange<Comment>) {
      if (change.eventType === "DELETE") {
        const id = change.old?.id;

        if (!id) return;

        const threads = queryClient.getQueriesData<Comment[]>({
          queryKey: queryKeys.commentThreads(),
        });

        for (const [key, thread] of threads) {
          if (!thread?.some((comment) => comment.id === id)) continue;

          queryClient.setQueryData<Comment[]>(
            key,
            applyCommentEvent(thread, change),
          );

          break;
        }

        return;
      }

      const todoId = change.new?.todo_id;

      if (!todoId) return;

      queryClient.setQueryData<Comment[]>(queryKeys.comments(todoId), (old) =>
        old ? applyCommentEvent(old, change) : old,
      );
    }

    const boardFilter = `board_id=eq.${boardId}`;

    const channel = supabase
      .channel(`board:${boardId}`, {
        config: {
          presence: {
            key: userId,
            // realtime-js only requests the initial snapshot if this is set explicitly, or if a presence binding exists at subscribe() time.
            enabled: true,
          },
        },
      })
      .on<Todo>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "todos",
          filter: boardFilter,
        },
        (payload) => patchTodos(payload as RowChange<Todo>),
      )
      .on<Todo>(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "todos",
          filter: boardFilter,
        },
        (payload) => patchTodos(payload as RowChange<Todo>),
      )
      .on<Todo>(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "todos" },
        (payload) => patchTodos(payload as RowChange<Todo>),
      )
      .on<IColumn>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "columns",
          filter: boardFilter,
        },
        (payload) => patchColumns(payload as RowChange<IColumn>),
      )
      .on<IColumn>(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "columns",
          filter: boardFilter,
        },
        (payload) => patchColumns(payload as RowChange<IColumn>),
      )
      .on<IColumn>(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "columns" },
        (payload) => patchColumns(payload as RowChange<IColumn>),
      )
      .on<Comment>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: boardFilter,
        },
        (payload) => patchComments(payload as RowChange<Comment>),
      )
      .on<Comment>(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "comments",
          filter: boardFilter,
        },
        (payload) => patchComments(payload as RowChange<Comment>),
      )
      .on<Comment>(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "comments" },
        (payload) => patchComments(payload as RowChange<Comment>),
      )
      // `sync` alone covers joins and leaves — Phoenix's onSync fires after the initial state and after every diff.
      .on("presence", { event: "sync" }, () => {
        const next = viewersFrom(
          channel.presenceState<PresenceMeta>() as PresenceState,
        );

        // Returning `prev` when unchanged lets React bail out of the re-render — otherwise every socket blink repaints the view.
        setViewers((prev) => (sameViewers(prev, next) ? prev : next));
      });

    let hasSubscribed = false;

    void channel.subscribe((status) => {
      // Presence is server-authoritative — nothing tells us our own roster went stale, so we clear it ourselves on drop.
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setViewers((prev) => (prev.length === 0 ? prev : []));

        return;
      }

      if (status !== "SUBSCRIBED") return;

      if (hasSubscribed) {
        // Reconnected after a drop — whatever happened in between was never delivered, so refetch.
        void queryClient.invalidateQueries({ queryKey: todosKey });
        void queryClient.invalidateQueries({ queryKey: columnsKey });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.commentThreads(),
        });
      }

      hasSubscribed = true;

      void channel.track({
        user_id: userId,
        at: new Date().toISOString(),
      } satisfies PresenceMeta);
    });

    return () => {
      // Known race: removeChannel's registry entry only clears once the server acks the leave, so a board revisited inside
      // that window binds onto a channel that's already leaving. See docs/REALTIME_VERIFICATION.md.
      void supabase.removeChannel(channel);
      setViewers([]);
    };
  }, [boardId, userId, queryClient]);

  return viewers;
}
