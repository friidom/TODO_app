import { useQuery } from "@tanstack/react-query";

import { getSpaces } from "./spacesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * The caller's spaces.
 *
 * Not board-scoped and takes no argument: a space belongs to a person, not to a
 * board, so this is an index like `useBoards` rather than a board-keyed query.
 */
export function useSpaces() {
  return useQuery({
    queryKey: queryKeys.spaces(),
    queryFn: getSpaces,
  });
}
