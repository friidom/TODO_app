import { useQuery } from "@tanstack/react-query";

import { fetchBoardGitLab, fetchSpaceGitLab } from "./gitlabApi";
import { linksPollInterval } from "./gitlabLinks";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useSpaceGitLab(spaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.spaceGitlab(spaceId),
    queryFn: () => fetchSpaceGitLab(spaceId!),
    enabled: Boolean(spaceId),
    refetchInterval: ({ state: { data, status } }) =>
      linksPollInterval({
        data:
          data &&
          [data.link, ...data.board_links].filter((link) => link !== null),
        status,
      }),
  });
}

export function useBoardGitLab(boardId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.boardGitlab(boardId),
    queryFn: () => fetchBoardGitLab(boardId!),
    enabled: Boolean(boardId),
    refetchInterval: ({ state: { data, status } }) =>
      linksPollInterval({
        data:
          data &&
          [data.space_link, ...data.board_links].filter(
            (link) => link !== null,
          ),
        status,
      }),
  });
}
