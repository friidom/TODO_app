import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createInvite,
  createSpaceInvite,
  type InviteRole,
  type InviteScope,
} from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export interface NewInvite {
  scope: InviteScope;
  // the boards a space invitation grants; ignored for a board
  boardIds: string[];
  role: InviteRole;
  expiresInDays: number;
  email: string | null;
}

// invalidates rather than patching — the server picks the token and expiry, nothing to guess at
export function useCreateInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { silent: true },

    mutationFn: ({ scope, boardIds, ...invite }: NewInvite) =>
      scope.kind === "board"
        ? createInvite({ boardId: scope.boardId, ...invite })
        : createSpaceInvite({ spaceId: scope.spaceId, boardIds, ...invite }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allInvites() });
      queryClient.invalidateQueries({ queryKey: queryKeys.allSpaceInvites() });

      // search marks anyone holding a live invite, so every cached search is now stale for one person
      queryClient.invalidateQueries({ queryKey: queryKeys.inviteeSearches() });
    },
  });
}
