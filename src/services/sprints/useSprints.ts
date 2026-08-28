import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Sprint } from "@/types/data";
import {
  completeSprint,
  createSprint,
  fetchSprints,
  startSprint,
  updateSprint,
  type CreateSprintInput,
  type SprintPatch,
} from "./sprintsApi";

/**
 * Every sprint on the open board (M30).
 *
 * One query per board, like `useColumns` — the Backlog page, the Task
 * Detail Sprint field and Sprint Details all read this same entry rather
 * than each fetching their own slice, so a sprint created in one no longer
 * needs a second round trip to appear in the other.
 *
 * **No realtime handler reads this cache.** `todos`/`columns` have one
 * because a drag on someone else's client has to appear on this one without
 * a refetch; a sprint's own fields change rarely enough, and only through
 * this board's own editors, that the mutations below patching their own
 * cache is enough for this milestone. Reopen if boards start collaborating
 * on sprint planning live.
 */
export function useSprints() {
  const boardId = useBoardId();

  return useQuery({
    queryKey: queryKeys.sprints(boardId),
    queryFn: () => {
      if (!boardId) throw new Error("useSprints ran without a board");
      return fetchSprints(boardId);
    },
    enabled: Boolean(boardId),
  });
}

/** One sprint by id, read out of the board's own cached list rather than a
 * second query — the same choice `useTodoHierarchy` makes for a single
 * `Todo`, for the same reason: the list is already loaded, already
 * invalidated by every mutation below, and a sprint is small enough that
 * fetching one on its own would be a second answer to a question the list
 * already has. */
export function useSprint(sprintId: string | null | undefined) {
  const { data: sprints = [], isPending, error } = useSprints();

  const sprint = useMemo(
    () => sprints.find((candidate) => candidate.id === sprintId) ?? null,
    [sprints, sprintId],
  );

  return { sprint, isPending, error };
}

export function useCreateSprint() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: (vars: Omit<CreateSprintInput, "board_id">) => {
      if (!boardId) throw new Error("useCreateSprint ran without a board");
      return createSprint({ ...vars, board_id: boardId });
    },

    onSuccess: (created) => {
      queryClient.setQueryData<Sprint[]>(
        queryKeys.sprints(boardId),
        (old = []) => [...old, created],
      );
    },
  });
}

export function useUpdateSprint() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: updateSprint,

    onSuccess: (updated) => {
      queryClient.setQueryData<Sprint[]>(
        queryKeys.sprints(boardId),
        (old = []) =>
          old.map((sprint) => (sprint.id === updated.id ? updated : sprint)),
      );
    },
  });
}

/**
 * Starts a future sprint. Bulk-assigns a column to every one of its items
 * that has none yet — the RPC's own write, not this hook's — so the Board
 * has new cards on it the moment this settles.
 *
 * **Invalidates rather than patches `todos`.** The RPC can move an
 * unbounded number of rows in one write, and computing what changed
 * client-side would mean re-deriving the same "first todo-category column"
 * logic the database just ran. A refetch is one request for an action that
 * is already a deliberate, infrequent click — not a drag this app optimises
 * the way it optimises `useTodoDrop`.
 */
export function useStartSprint() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: startSprint,

    onSuccess: (_data, sprintId) => {
      queryClient.setQueryData<Sprint[]>(
        queryKeys.sprints(boardId),
        (old = []) =>
          old.map((sprint) =>
            sprint.id === sprintId ? { ...sprint, state: "active" } : sprint,
          ),
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) });
    },
  });
}

/** Completes an active sprint, same reasoning as `useStartSprint` for why
 * `todos` is invalidated rather than patched. */
export function useCompleteSprint() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: ({
      sprintId,
      moveToSprintId,
    }: {
      sprintId: string;
      moveToSprintId: string | null;
    }) => completeSprint(sprintId, moveToSprintId),

    onSuccess: (_data, { sprintId }) => {
      queryClient.setQueryData<Sprint[]>(
        queryKeys.sprints(boardId),
        (old = []) =>
          old.map((sprint) =>
            sprint.id === sprintId
              ? { ...sprint, state: "completed" }
              : sprint,
          ),
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) });
    },
  });
}

export type { SprintPatch };
