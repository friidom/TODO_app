import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import * as adminRepo from "./admin.repo.js";
import {
  bucketOf,
  heatmapRange,
  periodRange,
  type AdminPeriod,
  type PeriodRange,
} from "./periods.js";
import { performanceOf, targetFor, type Performance } from "./kpi.js";
import { TASK_ACTIVITY } from "./admin.schema.js";
import type {
  ActivityQuery,
  BoardsQuery,
  FlowQuery,
  KpiTargetInput,
  UserQuery,
} from "./admin.schema.js";
import type { FlowSliceBy } from "./admin.repo.js";

function rangeOf(period: AdminPeriod): PeriodRange {
  return periodRange(period, new Date(), env.APP_TIMEZONE);
}

function withPerformance(
  user: adminRepo.UserMetrics,
  period: AdminPeriod,
  range: PeriodRange,
): adminRepo.UserMetrics & Performance {
  const target = targetFor(period, range, user.daily_points, user.weekly_points);

  return {
    ...user,
    target_points: target,
    performance: performanceOf(user.completed_points, target),
  };
}

export interface Overview {
  period: AdminPeriod;
  bucket: string;
  from: Date;
  to: Date;
  timezone: string;
  totals: adminRepo.SystemTotals;
  series: adminRepo.SeriesPoint[];
}

export async function overview(period: AdminPeriod): Promise<Overview> {
  const range = rangeOf(period);

  // Two queries, not one per panel and never one per user. The regression
  // test in admin.int.test.ts pins the count so an N+1 cannot creep back.
  const [totals, series] = await Promise.all([
    adminRepo.systemTotals(range.from, range.to),
    adminRepo.systemSeries(range.bucket, env.APP_TIMEZONE, range.from, range.to),
  ]);

  return {
    period,
    bucket: range.bucket,
    from: range.from,
    to: range.to,
    timezone: env.APP_TIMEZONE,
    totals,
    series,
  };
}

export async function users(input: UserQuery) {
  const period = input.period;
  const range = rangeOf(period);
  const rows = await adminRepo.userMetrics(range.from, range.to, {
    boardId: input.board,
    spaceId: input.space,
  });

  return {
    period,
    from: range.from,
    to: range.to,
    users: rows.map((row) => withPerformance(row, period, range)),
  };
}

export async function user(userId: string, input: UserQuery) {
  const { period } = input;
  const range = rangeOf(period);
  // The same facet the leaderboard takes, so the drill-down and /admin/flow
  // report on one population rather than agreeing only by coincidence (D-23).
  const scope = { boardId: input.board, spaceId: input.space };
  const row = await adminRepo.userMetricsOne(userId, range.from, range.to, scope);

  if (row === null) throw new AppError("not_found", "Not found.");

  const heat = heatmapRange(new Date(), env.APP_TIMEZONE);

  const [series, heatmap, durations, boardShare, recent] = await Promise.all([
    adminRepo.systemSeries(range.bucket, env.APP_TIMEZONE, range.from, range.to, {
      ...scope,
      userId,
    }),
    adminRepo.userHeatmap(userId, heat.from, heat.to, env.APP_TIMEZONE, scope),
    adminRepo.flowDurations(range.from, range.to, { ...scope, completedBy: userId }),
    adminRepo.userBoardShare(userId, range.from, range.to, scope),
    adminRepo.userRecentCompletions(userId, range.from, range.to, undefined, scope),
  ]);

  return {
    period,
    bucket: range.bucket,
    from: range.from,
    to: range.to,
    timezone: env.APP_TIMEZONE,
    user: withPerformance(row, period, range),
    series,
    // The only window in the API that ignores the selected period, and it
    // says so rather than leaving a reader to infer it (E2, V6). It does
    // honour the scope: a scope names a population, not a window, and an
    // unscoped grid beside scoped figures would contradict them.
    heatmap: { from: heat.from, to: heat.to, metric: "completed_todos", cells: heatmap },
    cycle_time: {
      median_days: durations.cycle_p50,
      p75_days: durations.cycle_p75,
      p90_days: durations.cycle_p90,
      n: durations.cycle_n,
      unmeasured: durations.cycle_unmeasured,
    },
    lead_time: {
      median_days: durations.lead_p50,
      p75_days: durations.lead_p75,
      p90_days: durations.lead_p90,
      n: durations.lead_n,
      unmeasured: 0,
    },
    cycle_histogram: fillBins(adminRepo.DURATION_EDGES, durations.histogram),
    board_share: boardShare,
    recent,
  };
}

export async function boards(input: BoardsQuery) {
  const range = rangeOf(input.period);

  return {
    period: input.period,
    from: range.from,
    to: range.to,
    boards: await adminRepo.boardMetrics(range.from, range.to, input.space),
  };
}

export async function spaces(period: AdminPeriod) {
  const range = rangeOf(period);

  return {
    period,
    from: range.from,
    to: range.to,
    spaces: await adminRepo.spaceMetrics(range.from, range.to),
  };
}

export async function space(spaceId: string, period: AdminPeriod) {
  const range = rangeOf(period);
  const row = await adminRepo.spaceMetricsOne(spaceId, range.from, range.to);

  if (row === null) throw new AppError("not_found", "Not found.");

  const [boards, series] = await Promise.all([
    adminRepo.boardMetrics(range.from, range.to, spaceId),
    adminRepo.systemSeries(range.bucket, env.APP_TIMEZONE, range.from, range.to, { spaceId }),
  ]);

  return {
    period,
    bucket: range.bucket,
    from: range.from,
    to: range.to,
    timezone: env.APP_TIMEZONE,
    space: row,
    boards,
    series,
  };
}

export async function todo(todoId: string) {
  const row = await adminRepo.todoDetail(todoId);

  if (row === null) throw new AppError("not_found", "Not found.");

  const activity = await adminRepo.activityFeed(
    { boardId: row.board_id, entityId: todoId },
    TASK_ACTIVITY,
  );

  return { todo: row, activity };
}

export async function board(boardId: string, period: AdminPeriod) {
  const range = rangeOf(period);
  const row = await adminRepo.boardMetricsOne(boardId, range.from, range.to);

  if (row === null) throw new AppError("not_found", "Not found.");

  const series = await adminRepo.systemSeries(
    range.bucket,
    env.APP_TIMEZONE,
    range.from,
    range.to,
    {
      boardId,
    },
  );

  return {
    period,
    bucket: range.bucket,
    from: range.from,
    to: range.to,
    timezone: env.APP_TIMEZONE,
    board: row,
    series,
  };
}

export async function activity(input: ActivityQuery) {
  const range = rangeOf(input.period);

  // An explicit from/to wins over the period, so a chart can hand the feed
  // the exact window a reader clicked on.
  const from = input.from ?? range.from;
  const to = input.to ?? range.to;

  const before =
    input.before !== undefined && input.before_id !== undefined
      ? { created_at: input.before, id: input.before_id }
      : undefined;

  const rows = await adminRepo.activityFeed(
    {
      userId: input.user,
      boardId: input.board,
      spaceId: input.space,
      action: input.action,
      from,
      to,
    },
    input.limit,
    before,
  );

  const last = rows.at(-1);

  return {
    period: input.period,
    from,
    to,
    activities: rows,
    // Handed back rather than computed by the client, so the cursor and the
    // order by can never disagree about what "the next page" means.
    next:
      rows.length < input.limit || last === undefined
        ? null
        : { before: last.created_at, before_id: last.id },
  };
}

export async function kpi() {
  return { targets: await adminRepo.kpiTargets() };
}

export async function setKpiTarget(seniority: string, input: KpiTargetInput, actorId: string) {
  const target = await adminRepo.updateKpiTarget(
    seniority,
    input.daily_points,
    input.weekly_points,
    actorId,
  );

  if (target === null) throw new AppError("not_found", "Not found.");

  await adminRepo.recordAudit({
    actorId,
    action: "kpi_target.updated",
    targetType: "kpi_target",
    targetId: seniority,
    payload: { daily_points: input.daily_points, weekly_points: input.weekly_points },
  });

  return { target };
}

export async function setSeniority(userId: string, seniority: string | null, actorId: string) {
  const updated = await adminRepo.setSeniority(userId, seniority);

  if (!updated) throw new AppError("not_found", "Not found.");

  await adminRepo.recordAudit({
    actorId,
    action: "user.seniority_changed",
    targetType: "user",
    targetId: userId,
    payload: { seniority },
  });

  return { id: userId, seniority };
}

export async function audit(limit: number) {
  return { entries: await adminRepo.auditLog(limit) };
}

export { bucketOf };

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
  category: string;
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

export interface Flow {
  period: AdminPeriod;
  bucket: string;
  from: Date;
  to: Date;
  timezone: string;
  cfd: adminRepo.CfdRow[];
  series: adminRepo.SeriesPoint[];
  cycle_time: DurationStats;
  lead_time: DurationStats;
  cycle_histogram: DurationBin[];
  wip: WipSlice[];
  wip_aging: AgingBucket[];
  slice_by: FlowSliceBy;
  slices: FlowSlice[];
}

function binsFrom(edges: number[]): { from_days: number; to_days: number | null }[] {
  return [
    { from_days: 0, to_days: edges[0]! },
    ...edges.map((edge, index) => ({ from_days: edge, to_days: edges[index + 1] ?? null })),
  ];
}

function fillBins(
  edges: number[],
  rows: { bucket: number; count: number }[] | null,
): DurationBin[] {
  const found = new Map((rows ?? []).map((row) => [row.bucket, row.count]));

  return binsFrom(edges).map((bin, index) => ({ ...bin, count: found.get(index) ?? 0 }));
}

const SYSTEM_WIP: { key: string; label: string; category: string }[] = [
  { key: "backlog", label: "Backlog", category: "none" },
  { key: "todo", label: "To do", category: "todo" },
  { key: "in_progress", label: "In progress", category: "in_progress" },
  { key: "in_review", label: "In review", category: "in_review" },
];

function shapeWip(rows: adminRepo.WipRow[], scoped: boolean): WipSlice[] {
  if (scoped) {
    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      category: row.category,
      count: row.count,
    }));
  }

  const found = new Map(rows.map((row) => [row.key, row.count]));

  return SYSTEM_WIP.map((slice) => ({ ...slice, count: found.get(slice.key) ?? 0 }));
}

function shapeAging(rows: adminRepo.AgingRow[]): AgingBucket[] {
  const found = new Map(rows.map((row) => [row.bucket, row.count]));

  return binsFrom(adminRepo.AGING_EDGES).map((bin, index) => ({
    key: bin.to_days === null ? `${bin.from_days - 1}+` : `${bin.from_days}-${bin.to_days - 1}`,
    label: bin.to_days === null ? `${bin.from_days - 1}d+` : `${bin.from_days}–${bin.to_days - 1}d`,
    from_days: bin.from_days,
    to_days: bin.to_days,
    count: found.get(index) ?? 0,
  }));
}

function sliceLabel(key: string | null, sliceBy: FlowSliceBy): string {
  if (key === null) return sliceBy === "estimate" ? "Unestimated" : "Unset";

  return sliceBy === "estimate" ? `${key} pts` : key;
}

export async function flow(input: FlowQuery): Promise<Flow> {
  const range = rangeOf(input.period);
  const scope = { boardId: input.board, spaceId: input.space };

  const [cfd, series, durations, wip, aging, slices] = await Promise.all([
    adminRepo.cumulativeFlow(range.bucket, env.APP_TIMEZONE, range.from, range.to, scope),
    adminRepo.systemSeries(range.bucket, env.APP_TIMEZONE, range.from, range.to, {
      boardId: input.board,
      spaceId: input.space,
    }),
    adminRepo.flowDurations(range.from, range.to, scope),
    adminRepo.wipBreakdown(scope),
    adminRepo.wipAging(scope),
    adminRepo.flowSlices(range.from, range.to, input.slice, scope),
  ]);

  return {
    period: input.period,
    bucket: range.bucket,
    from: range.from,
    to: range.to,
    timezone: env.APP_TIMEZONE,
    cfd,
    series,
    cycle_time: {
      median_days: durations.cycle_p50,
      p75_days: durations.cycle_p75,
      p90_days: durations.cycle_p90,
      n: durations.cycle_n,
      unmeasured: durations.cycle_unmeasured,
    },
    lead_time: {
      median_days: durations.lead_p50,
      p75_days: durations.lead_p75,
      p90_days: durations.lead_p90,
      n: durations.lead_n,
      unmeasured: 0,
    },
    cycle_histogram: fillBins(adminRepo.DURATION_EDGES, durations.histogram).map((bin) => bin),
    wip: shapeWip(wip, input.board !== undefined),
    wip_aging: shapeAging(aging),
    slice_by: input.slice,
    slices: slices.map((row) => ({
      key: row.key,
      label: sliceLabel(row.key, input.slice),
      count: row.count,
      cycle_median_days: row.cycle_median,
      lead_median_days: row.lead_median,
    })),
  };
}
