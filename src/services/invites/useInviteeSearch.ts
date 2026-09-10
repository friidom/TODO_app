import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { searchInvitees } from "./invitesApi";
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

export function useInviteeSearch(boardId: string | undefined, query: string) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);

  const enabled = Boolean(boardId) && debounced.length >= MIN_QUERY;

  const result = useQuery({
    queryKey: queryKeys.inviteeSearch(boardId, debounced),
    queryFn: () => searchInvitees(boardId!, debounced),
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
