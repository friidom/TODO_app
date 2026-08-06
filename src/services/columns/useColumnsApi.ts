import { useQuery } from "@tanstack/react-query";
import { getColumns } from "./columnsApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useColumns() {
  return useQuery({
    queryKey: queryKeys.columns(),
    queryFn: getColumns,
  });
}
