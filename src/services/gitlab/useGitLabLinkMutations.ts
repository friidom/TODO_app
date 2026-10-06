import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  connectGitLabProject,
  saveGitLabSigningToken,
  unlinkGitLabProject,
} from "./gitlabApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

// Silent, because each form shows its error beside the field it is about. Not
// optimistic, because the server decides which status a link is in. The
// invalidation is returned so the button stays busy until the list has caught
// up, rather than clearing the form a beat before the card appears.
function useGitLabLinkMutation<TVars extends object>(
  call: (vars: TVars & { boardId: string }) => Promise<unknown>,
  { dropsDevelopment = false }: { dropsDevelopment?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    meta: { silent: true },

    mutationFn: (vars: TVars) => {
      if (!boardId) throw new Error("GitLab mutation ran without a board");

      return call({ ...vars, boardId });
    },

    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.gitlabLinks(boardId),
        }),
        dropsDevelopment &&
          queryClient.invalidateQueries({
            queryKey: queryKeys.boardDevelopment(boardId),
          }),
      ]),
  });
}

export function useConnectGitLabProject() {
  return useGitLabLinkMutation<{ projectUrl: string }>(connectGitLabProject);
}

export function useSaveGitLabSigningToken() {
  return useGitLabLinkMutation<{ linkId: string; token: string }>(
    saveGitLabSigningToken,
  );
}

// The server's realtime emit cannot reach this tab, which is outside the
// board's room while on the settings page, and a task opened earlier may still
// hold the removed commits in its cache.
export function useUnlinkGitLabProject() {
  return useGitLabLinkMutation<{ linkId: string }>(unlinkGitLabProject, {
    dropsDevelopment: true,
  });
}
