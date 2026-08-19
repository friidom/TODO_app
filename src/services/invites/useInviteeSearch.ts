import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { searchInvitees } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/** Long enough that typing a name is one request, short enough to feel live. */
const DEBOUNCE_MS = 250;

/** Below this the RPC returns nothing, so there is no point asking. */
const MIN_QUERY = 2;

/**
 * `value`, but only after it has stopped changing for `delay`.
 *
 * Written here rather than lifted into `src/hooks/`: `BoardSearch` has the only
 * other debounce in the app and it is a different shape — it debounces a *write
 * to the URL*, and its `seen`/`draft` dance exists because the URL can also
 * change underneath it. Nothing about that generalises to this, and a shared
 * hook covering both would be the abstraction neither wanted.
 */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);

    return () => clearTimeout(id);
  }, [value, delay]);

  return settled;
}

/**
 * Registered users matching what has been typed into the invite field (M4-08).
 *
 * **The debounce is the whole point of the hook.** The query key includes the
 * text, so an un-debounced version would mint a cache entry and a request per
 * keystroke — eight round trips to type an address, and eight entries that are
 * never read again.
 *
 * `enabled` carries the same two-character floor the RPC enforces, so a query
 * too short to answer never leaves the browser. The floor is checked against
 * the *debounced* value, which is what keeps a fast typist from firing one
 * request as they pass through two characters.
 *
 * `placeholderData` holds the previous results while the next request is in
 * flight. Without it the list empties on every keystroke and the dropdown
 * flickers between "results" and "no users found" as you type.
 */
export function useInviteeSearch(boardId: string | undefined, query: string) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);

  const enabled = Boolean(boardId) && debounced.length >= MIN_QUERY;

  const result = useQuery({
    queryKey: queryKeys.inviteeSearch(boardId, debounced),
    queryFn: () => searchInvitees(boardId!, debounced),
    enabled,
    // The roster changes when someone is invited or joins, and this is a
    // typeahead — a stale hit for a few seconds is the right trade against a
    // request per keystroke.
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  return {
    ...result,
    /** The text the current results actually answer. */
    query: debounced,
    /** Typed something, but not yet enough to search. */
    tooShort: debounced.length > 0 && debounced.length < MIN_QUERY,
    /** A request is in flight and there is nothing to show yet. */
    searching: enabled && result.isPending,
  };
}
