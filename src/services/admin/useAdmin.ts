import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/services/queryClient/queryKeys";
import {
  activityQuery,
  fetchAdminActivity,
  fetchAdminBoard,
  fetchAdminBoards,
  fetchAdminSpace,
  fetchAdminSpaces,
  fetchAdminTodo,
  fetchAdminUser,
  fetchAdminUsers,
  boardsQuery,
  fetchAudit,
  fetchFlow,
  fetchKpi,
  flowQuery,
  usersQuery,
  fetchOverview,
  saveKpiTarget,
  saveSeniority,
} from "./adminApi";
import type { AdminPeriod } from "./periods";
import type {
  ActivityCursor,
  AdminActivityFilters,
  AdminScope,
  BoardFilters,
  FlowFilters,
  Seniority,
  UserFilters,
} from "./types";

// Every read below keeps the previous period on screen while the next one
// loads. Without it each period switch unmounts the whole screen -- nav
// included -- and the page jumps. AdminShell shows "updating…" from
// isFetching so the figures on screen are never silently stale.
export function useAdminOverview(period: AdminPeriod) {
  return useQuery({
    queryKey: queryKeys.adminOverview(period),
    queryFn: () => fetchOverview(period),
    placeholderData: keepPreviousData,
  });
}

export function useAdminFlow(filters: FlowFilters) {
  return useQuery({
    queryKey: queryKeys.adminFlow(flowQuery(filters)),
    queryFn: () => fetchFlow(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminUsers(period: AdminPeriod, scope: AdminScope = {}) {
  const filters: UserFilters = { period, ...scope };

  return useQuery({
    queryKey: queryKeys.adminUsers(usersQuery(filters)),
    queryFn: () => fetchAdminUsers(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminUser(
  userId: string | undefined,
  period: AdminPeriod,
  scope: AdminScope = {},
) {
  const filters: UserFilters = { period, ...scope };

  return useQuery({
    queryKey: queryKeys.adminUser(userId, usersQuery(filters)),
    queryFn: () => fetchAdminUser(userId!, filters),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  });
}

export function useAdminSpaces(period: AdminPeriod) {
  return useQuery({
    queryKey: queryKeys.adminSpaces(period),
    queryFn: () => fetchAdminSpaces(period),
    placeholderData: keepPreviousData,
  });
}

export function useAdminSpace(
  spaceId: string | undefined,
  period: AdminPeriod,
) {
  return useQuery({
    queryKey: queryKeys.adminSpace(spaceId, period),
    queryFn: () => fetchAdminSpace(spaceId!, period),
    enabled: Boolean(spaceId),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTodo(todoId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.adminTodo(todoId),
    queryFn: () => fetchAdminTodo(todoId!),
    enabled: Boolean(todoId),
  });
}

export function useAdminBoards(period: AdminPeriod, space?: string) {
  const filters: BoardFilters = { period, space };

  return useQuery({
    queryKey: queryKeys.adminBoards(boardsQuery(filters)),
    queryFn: () => fetchAdminBoards(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminBoard(
  boardId: string | undefined,
  period: AdminPeriod,
) {
  return useQuery({
    queryKey: queryKeys.adminBoard(boardId, period),
    queryFn: () => fetchAdminBoard(boardId!, period),
    enabled: Boolean(boardId),
    placeholderData: keepPreviousData,
  });
}

// Infinite rather than a plain query: /admin/activity has always returned a
// keyset cursor and the screen never spent it, so the feed stopped dead at
// one page however much had happened.
export function useAdminActivity(filters: AdminActivityFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminActivity(activityQuery(filters)),
    queryFn: ({ pageParam }) =>
      fetchAdminActivity(filters, pageParam ?? undefined),
    initialPageParam: null as ActivityCursor | null,
    getNextPageParam: (last) => last.next,
    placeholderData: keepPreviousData,
  });
}

export function useAdminKpi() {
  return useQuery({ queryKey: queryKeys.adminKpi(), queryFn: fetchKpi });
}

export function useAdminAudit() {
  return useQuery({ queryKey: queryKeys.adminAudit(), queryFn: fetchAudit });
}

// Both mutations invalidate the whole admin root rather than one key. A target
// changes every performance figure on every screen at every period, and a
// seniority changes which target a person is measured against — patching that
// by hand would mean the mutation knowing every panel that reads it.
export function useSaveKpiTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      seniority: Seniority;
      daily_points: number;
      weekly_points: number;
    }) =>
      saveKpiTarget(input.seniority, {
        daily_points: input.daily_points,
        weekly_points: input.weekly_points,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.admin() }),
  });
}

export function useSaveSeniority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; seniority: Seniority | null }) =>
      saveSeniority(input.id, input.seniority),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.admin() }),
  });
}
