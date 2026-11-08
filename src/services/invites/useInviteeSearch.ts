import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { searchInvitees, type InviteScope } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);

    return () => clearTimeout(id);
  }, [value, delay]);

  return settled;
}

export function useInviteeSearch(scope: InviteScope | null, query: string) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const scopeId =
    scope === null
      ? undefined
      : scope.kind === "board"
        ? scope.boardId
        : scope.spaceId;

  const enabled = scope !== null && debounced.length >= MIN_QUERY;

  const result = useQuery({
    queryKey: queryKeys.inviteeSearch(scopeId, debounced),
    queryFn: () => searchInvitees(scope!, debounced),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  return {
    ...result,
    query: debounced,
    tooShort: debounced.length > 0 && debounced.length < MIN_QUERY,
    searching: enabled && result.isPending,
  };
}
