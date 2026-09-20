import type { AdminPeriod } from "./periods";

export interface SystemTotals {
  users: number;
  boards: number;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  comments: number;
  activities: number;
  created_todos: number;
  open_todos: number;
}

export interface SeriesPoint {
  bucket: string;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  comments: number;
  activities: number;
}

export type Bucket = "hour" | "day" | "week" | "month";

export interface AdminOverview {
  period: AdminPeriod;
  bucket: Bucket;
  from: string;
  to: string;
  timezone: string;
  totals: SystemTotals;
  series: SeriesPoint[];
}

// target_points and performance are nullable and that is load-bearing, not a
// convenience: a user nobody has classified has no target, and the UI shows
// "—" rather than 0%, which would be a claim about them (M34 D-8, D-12).
export interface AdminUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string;
  org_role: string;
  seniority: Seniority | null;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  comments: number;
  activities: number;
  boards: number;
  daily_points: number | null;
  weekly_points: number | null;
  target_points: number | null;
  performance: number | null;
}

export const SENIORITIES = ["junior", "middle", "senior"] as const;

export type Seniority = (typeof SENIORITIES)[number];

export interface AdminUsers {
  period: AdminPeriod;
  from: string;
  to: string;
  users: AdminUser[];
}

export interface HeatmapCell {
  date: string;
  count: number;
}

export interface AdminUserDetail {
  period: AdminPeriod;
  bucket: Bucket;
  from: string;
  to: string;
  timezone: string;
  user: AdminUser;
  series: SeriesPoint[];
  // Its own window, because its question is year-shaped. `metric` names what
  // the cells count so a reader never has to guess (E2, V6).
  heatmap: { from: string; to: string; metric: string; cells: HeatmapCell[] };
}

export interface AdminBoard {
  id: string;
  title: string | null;
  key_prefix: string;
  owner_id: string | null;
  owner_username: string | null;
  members: number;
  todos: number;
  open_todos: number;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  comments: number;
  activities: number;
  last_activity_at: string | null;
}

export interface AdminBoards {
  period: AdminPeriod;
  from: string;
  to: string;
  boards: AdminBoard[];
}

export interface AdminBoardDetail {
  period: AdminPeriod;
  bucket: Bucket;
  board: AdminBoard;
  series: SeriesPoint[];
}

export interface AdminActivityRow {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  board_id: string;
  board_title: string | null;
  actor_id: string | null;
  actor_username: string | null;
  title: string | null;
  board_key: number | null;
}

export interface ActivityCursor {
  before: string;
  before_id: string;
}

export interface AdminActivity {
  period: AdminPeriod;
  from: string;
  to: string;
  activities: AdminActivityRow[];
  next: ActivityCursor | null;
}

export interface AdminActivityFilters {
  period: AdminPeriod;
  user?: string;
  board?: string;
  action?: string;
}

export interface KpiTarget {
  seniority: Seniority;
  daily_points: number;
  weekly_points: number;
  updated_at: string;
  updated_by: string | null;
  updated_by_username: string | null;
}

export interface AdminKpi {
  targets: KpiTarget[];
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  actor_username: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: unknown;
  created_at: string;
}

export interface AdminAudit {
  entries: AuditEntry[];
}
