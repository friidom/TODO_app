import { api, toQuery } from "@/services/api/client";
import type { AdminPeriod } from "./periods";
import type {
  AdminActivity,
  AdminActivityFilters,
  AdminAudit,
  AdminBoardDetail,
  AdminBoards,
  AdminKpi,
  AdminOverview,
  AdminUserDetail,
  AdminUsers,
  ActivityCursor,
  Seniority,
} from "./types";

export function fetchOverview(period: AdminPeriod): Promise<AdminOverview> {
  return api.get<AdminOverview>(`/admin/overview${toQuery({ period })}`);
}

export function fetchAdminUsers(period: AdminPeriod): Promise<AdminUsers> {
  return api.get<AdminUsers>(`/admin/users${toQuery({ period })}`);
}

export function fetchAdminUser(id: string, period: AdminPeriod): Promise<AdminUserDetail> {
  return api.get<AdminUserDetail>(`/admin/users/${id}${toQuery({ period })}`);
}

export function fetchAdminBoards(period: AdminPeriod): Promise<AdminBoards> {
  return api.get<AdminBoards>(`/admin/boards${toQuery({ period })}`);
}

export function fetchAdminBoard(id: string, period: AdminPeriod): Promise<AdminBoardDetail> {
  return api.get<AdminBoardDetail>(`/admin/boards/${id}${toQuery({ period })}`);
}

export function activityQuery(
  filters: AdminActivityFilters,
  cursor?: ActivityCursor,
): string {
  return toQuery({
    period: filters.period,
    user: filters.user,
    board: filters.board,
    action: filters.action,
    before: cursor?.before,
    before_id: cursor?.before_id,
  });
}

export function fetchAdminActivity(
  filters: AdminActivityFilters,
  cursor?: ActivityCursor,
): Promise<AdminActivity> {
  return api.get<AdminActivity>(`/admin/activity${activityQuery(filters, cursor)}`);
}

export function fetchKpi(): Promise<AdminKpi> {
  return api.get<AdminKpi>("/admin/kpi");
}

export function saveKpiTarget(
  seniority: Seniority,
  target: { daily_points: number; weekly_points: number },
) {
  return api.put<{ target: AdminKpi["targets"][number] }>(`/admin/kpi/${seniority}`, target);
}

export function saveSeniority(id: string, seniority: Seniority | null) {
  return api.patch<{ id: string; seniority: Seniority | null }>(`/admin/users/${id}`, {
    seniority,
  });
}

export function fetchAudit(): Promise<AdminAudit> {
  return api.get<AdminAudit>("/admin/audit");
}
