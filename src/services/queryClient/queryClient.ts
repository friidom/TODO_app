import { QueryClient } from "@tanstack/react-query";
import { retryQuery } from "./retryPolicy";

// `@tanstack/query-persist-client` and `query-sync-storage-persister` are
// installed but deliberately not wired up: ["todos"] is one global key, so a
// persisted cache would hand the next user of this browser the previous user's
// board. Revisit once M2 scopes the keys by board.

export const queryClient = new QueryClient({
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
