import { useQuery } from "@tanstack/react-query";
import { getColumns } from "./columnsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

export function useColumns() {
  const boardId = useBoardId();

  return useQuery({
    queryKey: queryKeys.columns(boardId),
    // `enabled` already stops this running without a board; the guard is what
    // proves it to the compiler, rather than asserting non-null.
    queryFn: () => {
      if (!boardId) throw new Error("useColumns ran without a board");
      return getColumns(boardId);
    },
    enabled: Boolean(boardId),
  });
}
