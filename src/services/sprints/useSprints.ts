import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Sprint } from "@/types/data";
import {
  completeSprint,
  createSprint,
  deleteSprint,
  fetchSprints,
  startSprint,
  updateSprint,
  type CreateSprintInput,
  type SprintPatch,
} from "./sprintsApi";

// one cache entry per board, shared by Backlog, Task Detail's Sprint field, and Sprint Details.
// no realtime channel — sprint fields change rarely enough that the mutations below patching their own cache is enough for now.
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

// found in the already-loaded list rather than a second query — a sprint is small enough that fetching one alone is pointless
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

// invalidates todos instead of patching — the RPC bulk-assigns a column to an unbounded number of rows server-side
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

// invalidates todos — deleting the sprint clears sprint_id on every item it held via ON DELETE SET NULL
export function useDeleteSprint() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: deleteSprint,

    onSuccess: (sprintId) => {
      queryClient.setQueryData<Sprint[]>(
        queryKeys.sprints(boardId),
        (old = []) => old.filter((sprint) => sprint.id !== sprintId),
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) });
    },
  });
}

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
            sprint.id === sprintId ? { ...sprint, state: "completed" } : sprint,
          ),
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) });
    },
  });
}

export type { SprintPatch };
