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
 * One board, live (M6-08, M6-09, M6-11).
 *
 * **One channel per board, subscribed where the board is mounted, removed on
 * unmount and on every board change.** The effect's dependencies are the board
 * id and the viewer's id, so navigating from board A to board B tears the first
 * channel down before the second opens — `removeChannel` unsubscribes *and*
 * drops it from the client's registry, which is what stops ten navigations from
 * leaving ten sockets behind.
 *
 * **Two subscriptions per table, and the asymmetry is forced by the schema.**
 * INSERT and UPDATE are filtered server-side to this board (`board_id=eq.…`),
 * which is what the plan asks for. DELETE is *not* filtered, because the tables
 * are `REPLICA IDENTITY DEFAULT`: a delete payload carries the primary key and
 * nothing else, so a filter on `board_id` could never match and filtered deletes
 * would simply never arrive — a card another client deleted would sit on screen
 * until reload. Unfiltered, the id arrives, and `applyTodoEvent` removes it if
 * this board holds it and does nothing if it does not. The alternative,
 * `replica identity full`, would put whole rows from boards you cannot read onto
 * your socket; the M6-07 migration records why that was refused.
 *
 * **Nothing here refetches on an event.** The payload is the row. The one
 * exception is a *re-*subscribe, which means the socket dropped and events were
 * missed while it was down — that is a gap, not an event, and re-syncing once is
 * how the plan's "a client offline for 30 seconds converges on reconnect"
 * criterion is met. The first subscribe never triggers it, because the board was
 * just fetched.
 *
 * **Presence rides this same channel** — there is no second one, and there is no
 * poll. This client publishes itself with `track()` once the subscription is
 * live, and reads the whole state back on every `sync`, which includes itself.
 * Nothing about it touches the query cache; see `presence.ts`.
 */
export function useBoardRealtime(boardId: string | undefined): string[] {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [viewers, setViewers] = useState<string[]>([]);

  const userId = user?.id;

  useEffect(() => {
    // No board, or no session: nothing to subscribe to, and a channel opened
    // without a JWT would receive nothing anyway because every policy on these
    // tables resolves through `accessible_board_ids()`.
    if (!boardId || !userId) return;

    const todosKey = queryKeys.todos(boardId);
    const columnsKey = queryKeys.columns(boardId);

    /**
     * Writing a cache entry that does not exist yet would be worse than
     * dropping the event: an entry holding one row looks to every reader like a
     * fully loaded board with one card on it. If the query has not resolved,
     * the fetch in flight is already going to carry this change.
     */
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
     * One comment event, routed to the thread it belongs to (M7-04).
     *
     * **Comments ride the board channel rather than a channel of their own.**
     * The plan sketched "subscribe only while a task is open; tear down on
     * close", written before M6-B existed. Doing it that way now would add a
     * second channel lifecycle — subscribe on open, tear down on close, ten
     * tasks in a row — whose failure modes are exactly the ones M6-B already
     * solved once and, worse, would drive the topic-reuse window recorded in
     * this file's cleanup on every task the user opens. Three bindings on the
     * channel that is already here inherit its reconnect and its teardown and
     * add no lifecycle at all.
     *
     * The cost is that a client receives comment events for cards it does not
     * have open. That costs nothing: the write below is skipped for a thread
     * that is not in cache, which is every thread but the open one.
     *
     * **Two routing shapes, and the schema forces the split.** INSERT and
     * UPDATE carry the whole row, so `todo_id` names the thread directly. A
     * DELETE carries the primary key and nothing else — the same
     * `REPLICA IDENTITY DEFAULT` consequence recorded above — so the thread has
     * to be found by searching the cached ones for that id. There is at most
     * one open thread, and ids are unique, so this is a scan of one short array
     * that stops at the first hit.
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

          // Ids are unique, so the thread holding it is the only one to touch.
          // Writing the rest would hand every cached thread a new array and
          // re-render threads nothing happened to.
          break;
        }

        return;
      }

      const todoId = change.new?.todo_id;

      if (!todoId) return;

      // Same rule as the two above: a thread that has not been fetched is left
      // alone rather than created holding one comment.
      queryClient.setQueryData<Comment[]>(queryKeys.comments(todoId), (old) =>
        old ? applyCommentEvent(old, change) : old,
      );
    }

    const boardFilter = `board_id=eq.${boardId}`;

    const channel = supabase
      .channel(`board:${boardId}`, {
        config: {
          presence: {
            // Keyed by the viewer rather than by the socket, so a person with
            // the board open in two tabs is one entry, not two.
            key: userId,
            // **Explicit, not inferred.** realtime-js turns presence on if a
            // `presence` binding exists when `subscribe()` runs *or* if this
            // flag is set (`RealtimeChannel._onSubscribe`), and without it the
            // client never asks for the initial snapshot — `presenceState()`
            // stays empty and no event ever fires. Relying on the binding
            // alone makes a correct feature depend on the order two chained
            // calls happen to be written in.
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
      // Comments (M7-04). Filterable by board for the same reason the other two
      // are, and that is what M7-01's denormalised `board_id` bought: without it
      // the filter would have to be a column the table does not have.
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
      // Phoenix's `onSync`, which fires after the initial state message *and*
      // after every diff — so joins and leaves both land here. Separate `join`
      // and `leave` listeners would run the same reduction a second time
      // against the same state.
      .on("presence", { event: "sync" }, () => {
        const next = viewersFrom(
          channel.presenceState<PresenceMeta>() as PresenceState,
        );

        // **Returning `prev` is the point, not an optimisation detail.** React
        // bails out of the re-render entirely when the next state is
        // `Object.is`-identical to the current one, so an unchanged roster
        // costs nothing below this hook. Without it every `sync` — and Phoenix
        // emits one per diff and per rejoin, not per arrival — would hand
        // `BoardPage` a new array and repaint the whole active view, cards
        // included, because someone's socket blinked.
        setViewers((prev) => (sameViewers(prev, next) ? prev : next));
      });

    // Local to this subscription, not a ref: a new board gets a new channel and
    // a fresh flag, so switching boards never looks like a reconnection.
    let hasSubscribed = false;

    void channel.subscribe((status) => {
      // **A dropped socket has to empty the stack, and only this client can do
      // it.** Presence is server-authoritative: everyone else learns we left
      // because Phoenix times our key out, but nothing tells *us* that the
      // roster we are still drawing has gone stale. Without this branch a
      // client that loses its connection keeps showing whoever was present at
      // the moment it dropped — indefinitely, and with no way to tell that
      // from a live board. Empty is the honest answer while disconnected; the
      // `sync` that follows the rejoin refills it.
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
        // We were subscribed, lost the socket, and are back. Whatever happened
        // in between was never delivered, so this is the one moment the board
        // is genuinely out of date. Invalidate rather than refetch: a board
        // nobody is looking at any more does not need the round trip.
        void queryClient.invalidateQueries({ queryKey: todosKey });
        void queryClient.invalidateQueries({ queryKey: columnsKey });
        // Threads too, since M7-04 (same branch, same reasoning — a comment
        // posted while the socket was down was never delivered). The prefix
        // matches every cached thread, but only a thread with an observer
        // refetches, and at most one is ever open.
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
      // Clears the presence entry, unsubscribes, and removes the channel from
      // the client's registry — all three, which is what `removeChannel` is for
      // and what `unsubscribe()` alone would not do.
      //
      // **Known window, recorded rather than papered over** (M6-12): the
      // registry entry only goes when the server acks the leave, and
      // `supabase.channel(topic)` hands back whatever is still registered. A
      // board revisited inside that round trip would bind onto a channel that
      // is already leaving, whose `subscribe()` no-ops — no `track`, no resync.
      // Tearing it down early destroys the in-flight leave and rejoins a topic
      // the server still holds, which is worse; the repair is to await this
      // promise before the next subscribe. See `docs/REALTIME_VERIFICATION.md`.
      void supabase.removeChannel(channel);
      setViewers([]);
    };
  }, [boardId, userId, queryClient]);

  return viewers;
}
