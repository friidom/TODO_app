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

/**
 * One board, live.
 *
 * One channel per board, torn down on unmount and on every board change. The
 * effect depends on the board id and the viewer's id, so navigating A to B
 * closes the first channel before opening the second — removeChannel
 * unsubscribes *and* drops it from the registry, which is what stops ten
 * navigations leaving ten sockets behind.
 *
 * Two subscriptions per table, and the asymmetry is forced by the schema.
 * INSERT and UPDATE are filtered server-side to this board. DELETE isn't,
 * because the tables are REPLICA IDENTITY DEFAULT: a delete payload carries the
 * primary key and nothing else, so a board_id filter could never match and
 * filtered deletes would never arrive. Unfiltered, the id arrives and the
 * handler removes it if this board holds it. `replica identity full` would put
 * whole rows from boards you can't read onto your socket.
 *
 * Nothing refetches on an event — the payload is the row. The exception is a
 * *re*-subscribe, which means the socket dropped and events were missed: that's
 * a gap, not an event.
 *
 * Presence rides this same channel. No second channel, no poll.
 */
export function useBoardRealtime(boardId: string | undefined): string[] {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [viewers, setViewers] = useState<string[]>([]);

  const userId = user?.id;

  useEffect(() => {
    // No board or no session: a channel opened without a JWT would receive
    // nothing anyway, since every policy resolves through accessible_board_ids().
    if (!boardId || !userId) return;

    const todosKey = queryKeys.todos(boardId);
    const columnsKey = queryKeys.columns(boardId);

    // Writing a cache entry that doesn't exist yet is worse than dropping the
    // event: an entry holding one row looks like a fully loaded board with one
    // card on it. If the query hasn't resolved, the fetch in flight covers this.
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

    /**
     * One comment event, routed to the thread it belongs to.
     *
     * Comments ride the board channel rather than one of their own. A
     * per-task channel would mean subscribe-on-open and tear-down-on-close for
     * every task opened, driving the topic-reuse window described in the
     * cleanup below. Three bindings on the existing channel inherit its
     * reconnect and teardown and add no lifecycle.
     *
     * The cost is receiving events for cards that aren't open, which is free:
     * the write is skipped for any thread not in cache.
     *
     * Two routing shapes. INSERT and UPDATE carry the row, so todo_id names the
     * thread. DELETE carries only the primary key, so the thread has to be found
     * by searching cached ones — at most one is open and ids are unique.
     */
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

          // Ids are unique, so this is the only thread to touch. Writing the
          // rest would hand every cached thread a new array.
          break;
        }

        return;
      }

      const todoId = change.new?.todo_id;

      if (!todoId) return;

      // Same rule as above: an unfetched thread is left alone rather than
      // created holding one comment.
      queryClient.setQueryData<Comment[]>(queryKeys.comments(todoId), (old) =>
        old ? applyCommentEvent(old, change) : old,
      );
    }

    const boardFilter = `board_id=eq.${boardId}`;

    const channel = supabase
      .channel(`board:${boardId}`, {
        config: {
          presence: {
            // Keyed by the viewer rather than the socket, so one person with two
            // tabs open is one entry.
            key: userId,
            // Explicit, not inferred. realtime-js turns presence on if a
            // `presence` binding exists when subscribe() runs *or* if this flag
            // is set; without it the client never asks for the initial snapshot
            // and no event ever fires. Relying on the binding alone makes this
            // depend on the order two chained calls happen to be written in.
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
      // Unfiltered, for the replica-identity reason above.
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
      // Filterable by board for the same reason the other two are, which is
      // what the denormalised board_id bought: without it the filter would need
      // a column the table doesn't have.
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
      // Unfiltered, for the replica-identity reason above.
      .on<Comment>(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "comments" },
        (payload) => patchComments(payload as RowChange<Comment>),
      )
      // `sync` alone is the complete signal: realtime-js registers it through
      // Phoenix's onSync, which fires after the initial state message and after
      // every diff, so joins and leaves both land here. Separate join/leave
      // listeners would run the same reduction twice.
      .on("presence", { event: "sync" }, () => {
        const next = viewersFrom(
          channel.presenceState<PresenceMeta>() as PresenceState,
        );

        // Returning `prev` is the point, not an optimisation. React bails out
        // of the re-render when the next state is Object.is-identical, so an
        // unchanged roster costs nothing below this hook. Without it every sync
        // — one per diff and per rejoin — would repaint the whole active view
        // because someone's socket blinked.
        setViewers((prev) => (sameViewers(prev, next) ? prev : next));
      });

    // Local to this subscription, not a ref: a new board gets a new channel and
    // a fresh flag, so switching boards never looks like a reconnection.
    let hasSubscribed = false;

    void channel.subscribe((status) => {
      // A dropped socket has to empty the stack, and only this client can do it.
      // Presence is server-authoritative: everyone else learns we left when
      // Phoenix times our key out, but nothing tells *us* the roster we're still
      // drawing is stale. Empty is the honest answer while disconnected; the
      // sync after the rejoin refills it.
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
        // Subscribed, lost the socket, back again. Whatever happened in between
        // was never delivered, so this is the one moment the board is genuinely
        // out of date. Invalidate rather than refetch: a board nobody is looking
        // at doesn't need the round trip.
        void queryClient.invalidateQueries({ queryKey: todosKey });
        void queryClient.invalidateQueries({ queryKey: columnsKey });
        // Threads too, same reasoning. The prefix matches every cached thread,
        // but only one with an observer refetches, and at most one is open.
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
      // Clears the presence entry, unsubscribes, and drops the channel from the
      // registry — all three, which unsubscribe() alone would not do.
      //
      // Known window, recorded rather than papered over: the registry entry only
      // goes when the server acks the leave, and supabase.channel(topic) hands
      // back whatever is still registered. A board revisited inside that round
      // trip binds onto a channel that is already leaving, whose subscribe()
      // no-ops. Tearing it down early destroys the in-flight leave and rejoins a
      // topic the server still holds, which is worse; the repair is to await
      // this promise before the next subscribe. See docs/REALTIME_VERIFICATION.md.
      void supabase.removeChannel(channel);
      setViewers([]);
    };
  }, [boardId, userId, queryClient]);

  return viewers;
}
