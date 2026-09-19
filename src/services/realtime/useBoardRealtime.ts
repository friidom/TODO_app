import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/services/auth/useAuth";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Comment, IColumn, Todo } from "@/types/data";
import {
  applyColumnEvent,
  applyCommentEvent,
  applyTodoEvent,
  type RowChange,
} from "./events";
import { sameViewers } from "./presence";
import { ALL_SCOPES, keysForScopes } from "./keysForScopes";
import { connectBoardSocket } from "./socket";

// One socket per board, opened here and torn down on unmount or board change.
// The room is joined after the connection authenticates; membership is checked
// server-side on that join, and again whenever it changes.
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

    // Comments ride the board socket rather than a per-task one, so opening/closing tasks never subscribes anything.
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

    function invalidate(keys: unknown[][]) {
      for (const queryKey of keys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }

    const socket = connectBoardSocket();

    let hasJoined = false;

    socket.on("connect", () => {
      socket.emit("board:join", boardId, (result) => {
        if (!result?.ok) {
          setViewers([]);

          return;
        }

        // Reconnected after a drop — whatever happened in between was never
        // delivered, so refetch rather than trying to reconstruct it.
        if (hasJoined) invalidate(keysForScopes(ALL_SCOPES, boardId));

        hasJoined = true;
      });
    });

    socket.on("todo:change", patchTodos);
    socket.on("column:change", patchColumns);
    socket.on("comment:change", patchComments);

    socket.on("board:invalidate", ({ scopes }) => {
      invalidate(keysForScopes(scopes, boardId));
    });

    // Returning `prev` when unchanged lets React bail out of the re-render — otherwise every heartbeat repaints the view.
    socket.on("presence:sync", (payload) => {
      if (payload.boardId !== boardId) return;

      setViewers((prev) => (sameViewers(prev, payload.viewers) ? prev : payload.viewers));
    });

    // Membership was removed, or the board was. Nothing more will arrive, and
    // the roster on screen is already a lie.
    socket.on("board:evicted", () => {
      hasJoined = false;
      setViewers([]);
    });

    // Presence is server-authoritative — nothing tells us our own roster went stale, so we clear it ourselves on drop.
    socket.on("disconnect", () => {
      setViewers((prev) => (prev.length === 0 ? prev : []));
    });

    socket.on("connect_error", () => {
      setViewers((prev) => (prev.length === 0 ? prev : []));
    });

    return () => {
      socket.disconnect();
      setViewers([]);
    };
  }, [boardId, userId, queryClient]);

  return viewers;
}
