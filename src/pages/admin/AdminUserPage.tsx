import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Link, useParams } from "react-router";

import AdminPage from "@/components/admin/AdminPage";
import RoleChip from "@/components/admin/RoleChip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AdminTaskPanel from "@/components/admin/AdminTaskPanel";
import BarSeries from "@/components/admin/BarSeries";
import BulletBar from "@/components/admin/BulletBar";
import ContributionHeatmap from "@/components/admin/ContributionHeatmap";
import FlowStats from "@/components/admin/FlowStats";
import Histogram from "@/components/admin/Histogram";
import ScopeFilter from "@/components/admin/ScopeFilter";
import SeniorityControl from "@/components/admin/SeniorityControl";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import SummaryCard, {
  DistributionRow,
  WidgetEmpty,
} from "@/components/summary/SummaryCard";
import { useAdminFeedScope } from "@/hooks/useAdminActivityRealtime";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useAdminScope } from "@/hooks/useAdminScope";
import { useOpenTask } from "@/hooks/useOpenTask";
import {
  useAdminBoards,
  useAdminSpaces,
  useAdminUser,
} from "@/services/admin/useAdmin";
import { barShare, peakOf, proportionOf } from "@/services/admin/flow";
import { dash, formatDuration, rangeLabel } from "@/services/admin/format";
import { backfillNote, startedNote } from "@/services/admin/backfill";
import { scopeQuery, userTrail } from "@/services/admin/drilldown";
import { periodLabel } from "@/services/admin/periods";
import { taskKey } from "@/utils/taskKey";
import type { BoardShare, RecentCompletion } from "@/services/admin/types";

export default function AdminUserPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { period } = useAdminPeriod();
  const { scope, setScope } = useAdminScope();
  const { taskId, openTask, closeTask } = useOpenTask();

  const { data, isLoading, error } = useAdminUser(id, period, scope);
  const boards = useAdminBoards(period, scope.space);
  const spaces = useAdminSpaces(period);

  const boardOptions = useMemo(
    () =>
      (boards.data?.boards ?? []).map((board) => ({
        id: board.id,
        label: board.title ?? t("common.untitledBoard"),
      })),
    [boards.data, t],
  );

  const spaceOptions = useMemo(
    () =>
      (spaces.data?.spaces ?? [])
        .filter((space) => space.id !== null)
        .map((space) => ({ id: space.id!, label: space.title })),
    [spaces.data],
  );

  // No feed on this page; the subscription is here so an open task panel
  // refreshes itself the way it does on every other surface that opens one.
  useAdminFeedScope(
    {
      board: scope.board,
      space: scope.space,
      spaceBoardIds: boards.data?.boards
        .filter((entry) => entry.space_id === scope.space)
        .map((entry) => entry.id),
    },
    taskId,
  );

  if (error || (!data && !isLoading)) {
    return (
      <AdminPage title={t("admin.columns.developer")}>
        <AdminEmpty>
          {t("admin.user.loadFailed")}{" "}
          <Link to="/admin/users" className="text-brand">
            {t("admin.user.backToList")}
          </Link>
        </AdminEmpty>
      </AdminPage>
    );
  }

  if (!data) {
    return (
      <AdminPage title={t("admin.columns.developer")}>
        <AdminSkeleton />
      </AdminPage>
    );
  }

  const { user } = data;
  const started = startedNote(data.from);

  return (
    <AdminPage
      title={user.username}
      leading={
        <Avatar className="shrink-0">
          <AvatarImage src={user.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-elevated text-ink-2 text-xs font-semibold">
            {user.username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {user.org_role === "superadmin" && <RoleChip />}
          {user.seniority && (
            <span className="border-hairline text-ink-2 text-micro rounded border px-1.5 py-px font-semibold">
              {t(`admin.seniority.${user.seniority}`)}
            </span>
          )}
          <span>
            {[user.full_name, user.email].filter(Boolean).join(" · ")}
          </span>
          <span aria-hidden>·</span>
          <span>{rangeLabel(data.from, data.to)}</span>
        </span>
      }
      trail={userTrail(user.username)}
      toolbar={
        <div className="flex flex-wrap items-center gap-1.5">
          <ScopeFilter
            scope={scope}
            setScope={setScope}
            spaces={spaceOptions}
            boards={boardOptions}
          />
          <SeniorityControl user={user} />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <SummaryCard
            title={t("admin.user.thisPeriod")}
            hint={t("admin.user.thisPeriodHint")}
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-3.5 pt-1 pb-3.5 sm:grid-cols-3 lg:grid-cols-5">
              <Fact
                label={t("admin.metrics.completedTasks")}
                value={dash(user.completed_todos)}
              />
              <Fact
                label={t("admin.metrics.completedPoints")}
                value={dash(user.completed_points)}
                aside={
                  user.unestimated_completed > 0
                    ? t("admin.unestimatedCount", {
                        count: user.unestimated_completed,
                      })
                    : undefined
                }
              />
              <Fact
                label={t("taskActivity.comments")}
                value={dash(user.comments)}
              />
              <Fact
                label={t("admin.metrics.activityEvents")}
                value={dash(user.activities)}
              />
              <Fact label={t("boards.title")} value={dash(user.boards)} />
            </dl>
          </SummaryCard>

          <BulletBar user={user} periodLabel={periodLabel(period)} />
        </div>

        <BarSeries
          points={data.series}
          bucket={data.bucket}
          title={t("admin.user.overTime")}
          note={backfillNote(data.from)}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-ink text-xs font-semibold tracking-tight">
            {t("admin.user.howLong")}
          </h2>

          {/* A comparison, and named as one: /admin/flow has no person facet
              by design (D-23), so this link widens the population to everyone
              in the same scope. The two panels below are this person's. */}
          <Link
            to={`/admin/flow?period=${period}${scopeQuery(scope)}`}
            className="text-ink-3 hover:text-brand text-mini transition-colors"
          >
            {t("admin.user.compare")}
          </Link>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <FlowStats
            cycle={data.cycle_time}
            lead={data.lead_time}
            note={started}
          />

          <Histogram
            title={t("admin.user.histogramTitle")}
            hint={t("admin.user.histogramHint")}
            bins={data.cycle_histogram}
            stats={data.cycle_time}
            className="xl:col-span-2"
          />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <BoardSplit shares={data.board_share} period={period} />
          <RecentWork
            rows={data.recent}
            onOpen={openTask}
            activityHref={`/admin/activity?user=${user.id}&period=${period}${scopeQuery(scope)}`}
          />
        </div>

        <ContributionHeatmap
          from={data.heatmap.from}
          to={data.heatmap.to}
          cells={data.heatmap.cells}
        />
      </div>

      {taskId && <AdminTaskPanel todoId={taskId} onClose={closeTask} />}
    </AdminPage>
  );
}

function Fact({
  label,
  value,
  aside,
}: {
  label: string;
  value: string;
  aside?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-ink-3 text-mini order-2 truncate">{label}</dt>
      <dd className="text-ink order-1 truncate text-xl font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
      {aside && (
        <p className="text-ink-3 text-mini order-3 truncate">{aside}</p>
      )}
    </div>
  );
}

function BoardSplit({
  shares,
  period,
}: {
  shares: BoardShare[];
  period: string;
}) {
  const { t } = useTranslation();
  const peak = peakOf(
    shares.map((share) => ({ count: share.completed_todos })),
  );
  const total = shares.reduce((sum, share) => sum + share.completed_todos, 0);

  return (
    <SummaryCard
      title={t("admin.user.whereTitle")}
      hint={t("admin.user.whereHint")}
    >
      {shares.length === 0 ? (
        <WidgetEmpty>{t("admin.user.nothingCompleted")}</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-2 px-3.5 pb-3.5">
          {shares.map((share) => (
            <DistributionRow
              key={share.board_id}
              label={
                <Link
                  to={`/admin/boards/${share.board_id}?period=${period}`}
                  className="hover:text-brand min-w-0 truncate transition-colors"
                >
                  {share.title ?? t("common.untitledBoard")}
                </Link>
              }
              title={share.title ?? t("common.untitledBoard")}
              count={share.completed_todos}
              percent={barShare(share.completed_todos, peak)}
              share={proportionOf(share.completed_todos, total)}
              barClassName="bg-brand/70"
              labelClassName="flex-[0_0_8rem]"
            />
          ))}
        </div>
      )}
    </SummaryCard>
  );
}

const RECENT_COLUMNS = "5rem minmax(10rem,2fr) minmax(7rem,1fr) 5rem 5rem";

function RecentWork({
  rows,
  onOpen,
  activityHref,
}: {
  rows: RecentCompletion[];
  onOpen: (todoId: string) => void;
  activityHref: string;
}) {
  const { t } = useTranslation();

  return (
    <SummaryCard
      title={t("admin.user.recentTitle")}
      hint={t("admin.user.recentHint")}
      action={
        <Link
          to={activityHref}
          className="text-ink-3 hover:text-brand text-mini transition-colors"
        >
          {t("admin.user.seeActivity")}
        </Link>
      }
    >
      <AdminGrid
        columns={RECENT_COLUMNS}
        label={t("admin.user.recentLabel")}
        embedded
      >
        <AdminRow header>
          <AdminCell header>{t("boards.key")}</AdminCell>
          <AdminCell header>{t("fields.title")}</AdminCell>
          <AdminCell header>{t("sidebar.board")}</AdminCell>
          <AdminCell header align="right">
            {t("admin.columns.points")}
          </AdminCell>
          <AdminCell header align="right">
            {t("admin.columns.cycle")}
          </AdminCell>
        </AdminRow>

        {rows.length === 0 ? (
          <AdminEmpty>{t("admin.user.nothingCompleted")}</AdminEmpty>
        ) : (
          rows.map((row) => (
            <AdminRow key={row.id} onOpen={() => onOpen(row.id)}>
              <AdminCell>
                <span className="text-ink-3 text-mini tabular-nums">
                  {taskKey(row.key_prefix, row.board_key) ?? "—"}
                </span>
              </AdminCell>

              <AdminCell>
                <span
                  className="text-ink truncate"
                  title={row.title ?? undefined}
                >
                  {row.title ?? t("common.untitled")}
                </span>
              </AdminCell>

              <AdminCell>
                <span className="text-ink-3 truncate">
                  {row.board_title ?? t("common.untitledBoard")}
                </span>
              </AdminCell>

              <AdminCell align="right">{dash(row.estimate)}</AdminCell>

              <AdminCell align="right">
                <span
                  className={row.cycle_days === null ? "text-ink-3" : undefined}
                >
                  {formatDuration(row.cycle_days)}
                </span>
              </AdminCell>
            </AdminRow>
          ))
        )}
      </AdminGrid>
    </SummaryCard>
  );
}
