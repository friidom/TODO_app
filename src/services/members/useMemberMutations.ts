import { useMutation, useQueryClient } from "@tanstack/react-query";

import { removeBoardMember, updateMemberRole } from "./membersApi";
import type { BoardMember } from "./membersApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

/**
 * The two membership mutations, optimistic with rollback.
 *
 * Both sit in one module because they share the whole shape — same cache entry,
 * same snapshot-and-restore, same reason for being optimistic. The board's
 * content mutations keep their own files because each patches the cache
 * differently; these two differ by one line.
 *
 * **Optimistic, unlike the invite mutations.** A role badge and a row are
 * things the user is looking directly at when they act, and the roster is a
 * handful of rows the client can transform exactly — no server-allocated token
 * or key to guess at, which is what made `useCreateInvite` an invalidate.
 *
 * The rollback is the part that matters rather than the speed. These calls are
 * refused by the database far more often than a content write is: the rank
 * rules mean an admin's demote of another admin is denied, and without a
 * restore the row would sit there showing a role the database never accepted.
 * `onError` puts the snapshot back, and the M1-07 `MutationCache` toast reports
 * why — so no `meta: { silent: true }` here, deliberately: unlike the invite
 * modal, these rows render no error of their own.
 */
function useMemberMutation<TVars extends { userId: string }>(
  call: (vars: TVars & { boardId: string }) => Promise<void>,
  patch: (members: BoardMember[], vars: TVars) => BoardMember[],
) {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    // The board comes from the route here rather than from the caller, and it
    // is the same value the cache key below is built from — so the row the RPC
    // writes and the entry the optimistic patch edits cannot disagree.
    // `board_roster` does not return `board_id` (six fields, and that list is
    // the exposure boundary), so a caller could not supply it from a member
    // row anyway.
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

    // The roster is the authority on what the RPC actually did — a role the
    // database normalised, or a membership that was already gone. Refetch
    // rather than trust the optimistic guess, on success and on failure alike.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members(boardId) });
    },
  });
}

export function useUpdateMemberRole() {
  return useMemberMutation<{ userId: string; role: string }>(
    updateMemberRole,
    (members, { userId, role }) =>
      // A new object rather than an in-place write: the snapshot above holds
      // these very rows, so mutating one would leave `onError` nothing to
      // restore. Same rule the todo cache functions record.
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
