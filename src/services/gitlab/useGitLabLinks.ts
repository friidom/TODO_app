import { useQuery } from "@tanstack/react-query";

import { fetchGitLabLinks } from "./gitlabApi";
import { linksPollInterval } from "./gitlabLinks";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useGitLabLinks(boardId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.gitlabLinks(boardId),
    queryFn: () => fetchGitLabLinks(boardId!),
    enabled: Boolean(boardId),
    refetchInterval: (query) => linksPollInterval(query.state),
  });
}
