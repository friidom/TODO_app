import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  connectSpaceGitLab,
  disconnectGitLabLink,
  saveGitLabSigningToken,
  type GitLabOwner,
} from "./gitlabApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// Silent, because each form shows its error beside the field it is about. Not
// optimistic, because the server decides which status a link is in. The
// invalidation is returned so the button stays busy until the page has caught
// up, rather than clearing the form a beat before the card appears.
//
// reachesTasks: this tab is outside every board's realtime room while on a
// settings page, and a task opened earlier may still hold the old project.
function useGitLabMutation<TVars>(
  call: (vars: TVars) => Promise<unknown>,
  { reachesTasks = false }: { reachesTasks?: boolean } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { silent: true },
    mutationFn: call,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.gitlab() }),
        reachesTasks &&
          queryClient.invalidateQueries({
            queryKey: queryKeys.developments(),
          }),
      ]),
  });
}

export function useConnectSpaceGitLab(spaceId: string) {
  return useGitLabMutation(
    ({ projectUrl }: { projectUrl: string }) =>
      connectSpaceGitLab({ spaceId, projectUrl }),
    { reachesTasks: true },
  );
}

export function useSaveGitLabSigningToken(owner: GitLabOwner) {
  return useGitLabMutation(
    ({ linkId, token }: { linkId: string; token: string }) =>
      saveGitLabSigningToken({ owner, linkId, token }),
  );
}

export function useDisconnectGitLab(owner: GitLabOwner) {
  return useGitLabMutation(
    ({ linkId }: { linkId: string }) => disconnectGitLabLink({ owner, linkId }),
    { reachesTasks: true },
  );
}
