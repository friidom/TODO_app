import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/services/queryClient/queryKeys";
import { resolveTaskRef } from "./taskRefsApi";

export function useTaskRef(ref: string | undefined) {
  return useQuery({
    queryKey: queryKeys.taskRef(ref),
    queryFn: () => resolveTaskRef(ref!),
    enabled: Boolean(ref),
  });
}
