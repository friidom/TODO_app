import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/services/queryClient/queryKeys";
import {
  activityQuery,
  fetchAdminActivity,
  fetchAdminBoard,
  fetchAdminBoards,
  fetchAdminUser,
  fetchAdminUsers,
  fetchAudit,
  fetchKpi,
  fetchOverview,
  saveKpiTarget,
  saveSeniority,
} from "./adminApi";
import type { AdminPeriod } from "./periods";
import type { AdminActivityFilters, Seniority } from "./types";

export function useAdminOverview(period: AdminPeriod) {
  return useQuery({
    queryKey: queryKeys.adminOverview(period),
    queryFn: () => fetchOverview(period),
  });
}

export function useAdminUsers(period: AdminPeriod) {
  return useQuery({
    queryKey: queryKeys.adminUsers(period),
    queryFn: () => fetchAdminUsers(period),
  });
}

export function useAdminUser(userId: string | undefined, period: AdminPeriod) {
  return useQuery({
    queryKey: queryKeys.adminUser(userId, period),
    queryFn: () => fetchAdminUser(userId!, period),
    enabled: Boolean(userId),
  });
}

export function useAdminBoards(period: AdminPeriod) {
  return useQuery({
    queryKey: queryKeys.adminBoards(period),
    queryFn: () => fetchAdminBoards(period),
  });
}

export function useAdminBoard(boardId: string | undefined, period: AdminPeriod) {
  return useQuery({
    queryKey: queryKeys.adminBoard(boardId, period),
    queryFn: () => fetchAdminBoard(boardId!, period),
    enabled: Boolean(boardId),
  });
}

export function useAdminActivity(filters: AdminActivityFilters) {
  return useQuery({
    queryKey: queryKeys.adminActivity(activityQuery(filters)),
    queryFn: () => fetchAdminActivity(filters),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin() }),
  });
}

export function useSaveSeniority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; seniority: Seniority | null }) =>
      saveSeniority(input.id, input.seniority),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin() }),
  });
}
