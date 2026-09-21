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
  created_todos: number;
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
  median_cycle_days: number | null;
  cycle_n: number;
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
  cycle_time: DurationStats;
  lead_time: DurationStats;
  cycle_histogram: DurationBin[];
  board_share: BoardShare[];
  recent: RecentCompletion[];
}

export interface BoardShare {
  board_id: string;
  title: string | null;
  completed_todos: number;
  completed_points: number;
}

export interface RecentCompletion {
  id: string;
  board_id: string;
  board_title: string | null;
  key_prefix: string;
  board_key: number | null;
  title: string | null;
  completed_at: string;
  estimate: number | null;
  cycle_days: number | null;
}

export interface AdminBoard {
  id: string;
  title: string | null;
  key_prefix: string;
  owner_id: string | null;
  space_id: string | null;
  space_title: string | null;
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
  median_cycle_days: number | null;
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
  from: string;
  to: string;
  timezone: string;
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
  key_prefix: string;
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
  space?: string;
  from?: string;
  to?: string;
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

export interface AdminScope {
  space?: string;
  board?: string;
}

export interface CfdPoint {
  bucket: string;
  created: number;
  started: number;
  done: number;
}

export interface DurationStats {
  median_days: number | null;
  p75_days: number | null;
  p90_days: number | null;
  n: number;
  unmeasured: number;
}

export interface DurationBin {
  from_days: number;
  to_days: number | null;
  count: number;
}

export interface WipSlice {
  key: string;
  label: string;
  category: "todo" | "in_progress" | "done" | "none";
  count: number;
}

export interface AgingBucket {
  key: string;
  label: string;
  from_days: number;
  to_days: number | null;
  count: number;
}

export interface FlowSlice {
  key: string | null;
  label: string;
  count: number;
  cycle_median_days: number | null;
  lead_median_days: number | null;
}

export type FlowSliceBy = "estimate" | "priority" | "type";

export const FLOW_SLICES: FlowSliceBy[] = ["estimate", "priority", "type"];

export const FLOW_SLICE_LABELS: Record<FlowSliceBy, string> = {
  estimate: "By estimate",
  priority: "By priority",
  type: "By type",
};

export interface FlowFilters extends AdminScope {
  period: AdminPeriod;
  slice?: FlowSliceBy;
}

export interface UserFilters extends AdminScope {
  period: AdminPeriod;
}

export interface BoardFilters {
  period: AdminPeriod;
  space?: string;
}

export interface AdminFlow {
  period: AdminPeriod;
  bucket: Bucket;
  from: string;
  to: string;
  timezone: string;
  cfd: CfdPoint[];
  series: SeriesPoint[];
  cycle_time: DurationStats;
  lead_time: DurationStats;
  cycle_histogram: DurationBin[];
  wip: WipSlice[];
  wip_aging: AgingBucket[];
  slice_by: FlowSliceBy;
  slices: FlowSlice[];
}

export interface SpaceMetrics {
  id: string | null;
  title: string;
  owner_id: string | null;
  owner_username: string | null;
  boards: number;
  members: number;
  todos: number;
  open_todos: number;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  comments: number;
  activities: number;
  last_activity_at: string | null;
  median_cycle_days: number | null;
}

export interface AdminSpaceDetail {
  period: AdminPeriod;
  bucket: Bucket;
  from: string;
  to: string;
  timezone: string;
  space: SpaceMetrics;
  boards: AdminBoard[];
  series: SeriesPoint[];
}

export interface AdminSpaces {
  period: AdminPeriod;
  from: string;
  to: string;
  spaces: SpaceMetrics[];
}

export interface AdminTodoDetail {
  todo: {
    id: string;
    board_id: string;
    board_title: string | null;
    key_prefix: string;
    board_key: number | null;
    space_id: string | null;
    space_title: string | null;
    title: string | null;
    type: string;
    priority: string | null;
    estimate: number | null;
    column_id: string | null;
    column_title: string | null;
    category: string | null;
    assignee_id: string | null;
    assignee_username: string | null;
    completed_by: string | null;
    completed_by_username: string | null;
    creator_id: string | null;
    creator_username: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    cycle_days: number | null;
    lead_days: number | null;
  };
  activity: AdminActivityRow[];
}
