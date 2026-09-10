import { useQuery } from "@tanstack/react-query";

import { getSpaces } from "./spacesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// Not board-scoped — a space belongs to a person, so this is an index query like useBoards.
export function useSpaces() {
  return useQuery({
    queryKey: queryKeys.spaces(),
    queryFn: getSpaces,
  });
}
