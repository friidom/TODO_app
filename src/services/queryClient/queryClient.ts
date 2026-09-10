import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { toast } from "@/stores/toasts";
import { retryQuery } from "./retryPolicy";

// type alias, not interface — TanStack's Register needs meta to satisfy Record<string, unknown>,
// and an interface has no implicit index signature, so it'd silently fall back to untyped meta
type ErrorMeta = {
  silent?: boolean;
};

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: ErrorMeta;
    queryMeta: ErrorMeta;
  }
}

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };

    if (typeof message === "string" && message) return message;
  }

  return FALLBACK_MESSAGE;
}

const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    if (mutation.meta?.silent) return;

    toast.error(messageOf(error));
  },

  // activities is trigger-written, so nothing else tells the client a row appeared — this keeps
  // an open feed from going stale after a write. No-op if nothing has it mounted (invalidate, not refetch).
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ["activities"] });
  },
});

const queryCache = new QueryCache({
  onError: (error, query) => {
    if (query.meta?.silent) return;

    // a failed first load is already rendered by whoever owns the query — only toast a failed refetch
    if (query.state.data === undefined) return;

    toast.error(messageOf(error));
  },
});

export const queryClient = new QueryClient({
  mutationCache,
  queryCache,

  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: retryQuery,
    },

    mutations: {
      // addTodo isn't idempotent, so a retried create would duplicate the row
      retry: false,
    },
  },
});

// query-persist-client is installed but not wired up — ["todos", boardId] isn't scoped by user,
// so persisting it would leak the previous session's rows to whoever uses this browser next.
