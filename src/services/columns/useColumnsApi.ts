import { useQuery } from "@tanstack/react-query";
import { getColumns } from "./columnsApi";

export function useColumns() {
  return useQuery({
    queryKey: ["columns"],
    queryFn: getColumns,
  });
}