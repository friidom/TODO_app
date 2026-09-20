import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import * as adminRepo from "./admin.repo.js";
import { bucketOf, heatmapRange, periodRange, type AdminPeriod, type PeriodRange } from "./periods.js";
import { performanceOf, targetFor, type Performance } from "./kpi.js";
import type { ActivityQuery, KpiTargetInput } from "./admin.schema.js";

function rangeOf(period: AdminPeriod): PeriodRange {
  return periodRange(period, new Date(), env.APP_TIMEZONE);
}

function withPerformance(
  user: adminRepo.UserMetrics,
  period: AdminPeriod,
  range: PeriodRange,
): adminRepo.UserMetrics & Performance {
  const target = targetFor(period, range, user.daily_points, user.weekly_points);

  return { ...user, target_points: target, performance: performanceOf(user.completed_points, target) };
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

export async function users(period: AdminPeriod) {
  const range = rangeOf(period);
  const rows = await adminRepo.userMetrics(range.from, range.to);

  return {
    period,
    from: range.from,
    to: range.to,
    users: rows.map((row) => withPerformance(row, period, range)),
  };
}

export async function user(userId: string, period: AdminPeriod) {
  const range = rangeOf(period);
  const row = await adminRepo.userMetricsOne(userId, range.from, range.to);

  if (row === null) throw new AppError("not_found", "Not found.");

  const heat = heatmapRange(new Date(), env.APP_TIMEZONE);

  const [series, heatmap] = await Promise.all([
    adminRepo.systemSeries(range.bucket, env.APP_TIMEZONE, range.from, range.to, {
      userId,
    }),
    adminRepo.userHeatmap(userId, heat.from, heat.to, env.APP_TIMEZONE),
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
    // says so rather than leaving a reader to infer it (E2, V6).
    heatmap: { from: heat.from, to: heat.to, metric: "completed_todos", cells: heatmap },
  };
}

export async function boards(period: AdminPeriod) {
  const range = rangeOf(period);

  return { period, from: range.from, to: range.to, boards: await adminRepo.boardMetrics(range.from, range.to) };
}

export async function board(boardId: string, period: AdminPeriod) {
  const range = rangeOf(period);
  const row = await adminRepo.boardMetricsOne(boardId, range.from, range.to);

  if (row === null) throw new AppError("not_found", "Not found.");

  const series = await adminRepo.systemSeries(range.bucket, env.APP_TIMEZONE, range.from, range.to, {
    boardId,
  });

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
    { userId: input.user, boardId: input.board, action: input.action, from, to },
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
