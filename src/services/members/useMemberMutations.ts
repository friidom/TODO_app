import { useMutation, useQueryClient } from "@tanstack/react-query";

import { removeBoardMember, updateMemberRole } from "./membersApi";
import type { BoardMember } from "./membersApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

// Not silent — unlike the invite modal, these rows render no error of their own, so the rollback + global toast is the only signal.
function useMemberMutation<TVars extends { userId: string }>(
  call: (vars: TVars & { boardId: string }) => Promise<void>,
  patch: (members: BoardMember[], vars: TVars) => BoardMember[],
) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: (vars: TVars) => {
      if (!boardId) throw new Error("member mutation ran without a board");

      return call({ ...vars, boardId });
    },

    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.members(boardId) });

      const previous = queryClient.getQueryData<BoardMember[]>(
        queryKeys.members(boardId),
      );

      queryClient.setQueryData<BoardMember[]>(
        queryKeys.members(boardId),
        (old = []) => patch(old, vars),
      );

      return { previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.members(boardId), context.previous);
      }
    },

    // refetch rather than trust the optimistic guess — the roster is the authority on what the RPC actually did
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members(boardId) });
    },
  });
}

export function useUpdateMemberRole() {
  return useMemberMutation<{ userId: string; role: string }>(
    updateMemberRole,
    (members, { userId, role }) =>
      members.map((member) =>
        member.id === userId ? { ...member, role } : member,
      ),
  );
}

export function useRemoveMember() {
  return useMemberMutation<{ userId: string }>(
    removeBoardMember,
    (members, { userId }) => members.filter((member) => member.id !== userId),
  );
}
