import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { toast } from "@/stores/toasts";
import { retryQuery } from "./retryPolicy";

/**
 * Opt-out from the global handlers below, per query or per mutation.
 *
 * A type alias rather than an interface on purpose: TanStack's `Register` only
 * adopts a meta type that satisfies `Record<string, unknown>`, and an interface
 * has no implicit index signature — declaring this as an interface would fall
 * back to untyped meta without any error to say so.
 */
type ErrorMeta = {
  /** Skip the global toast: this caller renders its own failure message. */
  silent?: boolean;
};

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: ErrorMeta;
    queryMeta: ErrorMeta;
  }
}

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

/**
 * Supabase throws PostgrestError, AuthError and StorageError, all of which
 * extend Error. Anything else reaching here has no message worth showing.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };

    if (typeof message === "string" && message) return message;
  }

  return FALLBACK_MESSAGE;
}

// Not one mutation surfaced a failure before this, so a rejected write and a
// successful one looked identical — an RLS policy could deny every insert and
// the only symptom would be cards that vanish on refresh. The mutation's own
// onError still runs after this handler; `meta: { silent: true }` is how a
// caller that reports failure itself avoids saying it twice.
const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    if (mutation.meta?.silent) return;

    toast.error(messageOf(error));
  },

  /**
   * Mark the activity feed stale after any successful write (M18).
   *
   * **The gap this closes.** `activities` is written by database triggers, so
   * the client never learns that an entry appeared: moving a card patches the
   * todos cache optimistically and the server writes a row nobody asked about.
   * Without this, a feed open on the Summary tab stays frozen while you work in
   * front of it — the one place the log is guaranteed to be watched.
   *
   * **Why it belongs here and not in the mutations.** Every mutation would
   * otherwise grow an invalidate that has nothing to do with what it writes,
   * and a new one added later would silently not have it. This file already
   * owns the cross-cutting mutation concern (the failure toast); the feed is
   * the second one.
   *
   * **It costs nothing on the board.** `invalidateQueries` on a query with no
   * mounted observer only marks it stale — no request is made. `useActivities`
   * is mounted only on the Summary tab and inside the `?panel=activity`
   * drawer, so on Board and List this handler does no network work at all.
   *
   * The prefix `["activities"]` rather than a board-scoped key: this handler
   * has no board in scope, and the only entries it can match belong to boards
   * this session has actually opened. Realtime (M6-B) is what eventually
   * replaces this with a push, and it is the shape an append-only table
   * handles best.
   */
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ["activities"] });
  },
});

const queryCache = new QueryCache({
  onError: (error, query) => {
    if (query.meta?.silent) return;

    // A first load that fails is already rendered by the component holding the
    // query — KanbanBoard shows error.message. Toasting it too would say the
    // same thing twice. A refetch that fails when data is already on screen is
    // the silent case: the board keeps showing stale rows with no other signal.
    if (query.state.data === undefined) return;

    toast.error(messageOf(error));
  },
});

export const queryClient = new QueryClient({
  mutationCache,
  queryCache,

  defaultOptions: {
    queries: {
      // The board changes slowly and nothing pushes updates yet (realtime is
      // M6), so a tab switch inside this window should cost nothing. Past it
      // the focus refetch still runs — that is the staleness safety net, so it
      // stays on.
      staleTime: 30_000,

      // Long enough to visit the profile page and come back to a warm board.
      gcTime: 10 * 60_000,

      retry: retryQuery,
    },

    mutations: {
      // TanStack's default, stated rather than assumed: addTodo is not
      // idempotent, so a retried create is a duplicate row.
      retry: false,
    },
  },
});

// `@tanstack/query-persist-client` and `query-sync-storage-persister` are
// installed but still deliberately not wired up.
//
// M2-11 scoped the keys by board, which was the condition this note was
// waiting on — but it is not sufficient on its own. A board id is not a
// secret, and nothing about ["todos", boardId] is scoped to the *user*, so a
// persisted cache would still hand the next person to use this browser the
// rows of whoever was signed in before. Wiring it up needs the persisted key
// namespaced by user id, and a deliberate decision about what survives
// sign-out — which is its own task, not a side effect of board scoping.
