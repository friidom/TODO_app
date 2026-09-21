import { api, toQuery } from "@/services/api/client";
import type { AdminPeriod } from "./periods";
import type {
  AdminActivity,
  AdminActivityFilters,
  AdminAudit,
  AdminBoardDetail,
  AdminBoards,
  AdminFlow,
  AdminKpi,
  AdminOverview,
  AdminSpaceDetail,
  AdminSpaces,
  AdminTodoDetail,
  AdminUserDetail,
  AdminUsers,
  ActivityCursor,
  BoardFilters,
  FlowFilters,
  Seniority,
  UserFilters,
} from "./types";

export function fetchOverview(period: AdminPeriod): Promise<AdminOverview> {
  return api.get<AdminOverview>(`/admin/overview${toQuery({ period })}`);
}

export function fetchAdminUsers(filters: UserFilters): Promise<AdminUsers> {
  return api.get<AdminUsers>(`/admin/users${usersQuery(filters)}`);
}

export function fetchAdminUser(
  id: string,
  period: AdminPeriod,
): Promise<AdminUserDetail> {
  return api.get<AdminUserDetail>(`/admin/users/${id}${toQuery({ period })}`);
}

export function flowQuery(filters: FlowFilters): string {
  return toQuery({
    period: filters.period,
    space: filters.space,
    board: filters.board,
    slice: filters.slice,
  });
}

export function fetchFlow(filters: FlowFilters): Promise<AdminFlow> {
  return api.get<AdminFlow>(`/admin/flow${flowQuery(filters)}`);
}

export function fetchAdminSpaces(period: AdminPeriod): Promise<AdminSpaces> {
  return api.get<AdminSpaces>(`/admin/spaces${toQuery({ period })}`);
}

export function fetchAdminSpace(
  id: string,
  period: AdminPeriod,
): Promise<AdminSpaceDetail> {
  return api.get<AdminSpaceDetail>(`/admin/spaces/${id}${toQuery({ period })}`);
}

export function fetchAdminTodo(id: string): Promise<AdminTodoDetail> {
  return api.get<AdminTodoDetail>(`/admin/todos/${id}`);
}

export function usersQuery(filters: UserFilters): string {
  return toQuery({
    period: filters.period,
    space: filters.space,
    board: filters.board,
  });
}

export function boardsQuery(filters: BoardFilters): string {
  return toQuery({ period: filters.period, space: filters.space });
}

export function fetchAdminBoards(filters: BoardFilters): Promise<AdminBoards> {
  return api.get<AdminBoards>(`/admin/boards${boardsQuery(filters)}`);
}

export function fetchAdminBoard(
  id: string,
  period: AdminPeriod,
): Promise<AdminBoardDetail> {
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
    space: filters.space,
    from: filters.from,
    to: filters.to,
    before: cursor?.before,
    before_id: cursor?.before_id,
  });
}

export function fetchAdminActivity(
  filters: AdminActivityFilters,
  cursor?: ActivityCursor,
): Promise<AdminActivity> {
  return api.get<AdminActivity>(
    `/admin/activity${activityQuery(filters, cursor)}`,
  );
}

export function fetchKpi(): Promise<AdminKpi> {
  return api.get<AdminKpi>("/admin/kpi");
}

export function saveKpiTarget(
  seniority: Seniority,
  target: { daily_points: number; weekly_points: number },
) {
  return api.put<{ target: AdminKpi["targets"][number] }>(
    `/admin/kpi/${seniority}`,
    target,
  );
}

export function saveSeniority(id: string, seniority: Seniority | null) {
  return api.patch<{ id: string; seniority: Seniority | null }>(
    `/admin/users/${id}`,
    {
      seniority,
    },
  );
}

export function fetchAudit(): Promise<AdminAudit> {
  return api.get<AdminAudit>("/admin/audit");
}
