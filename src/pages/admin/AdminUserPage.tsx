import { useMemo } from "react";
import { Link, useParams } from "react-router";

import AdminCrumbs from "@/components/admin/AdminCrumbs";
import AdminShell from "@/components/admin/AdminShell";
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
import { useAdminActivityRealtime } from "@/hooks/useAdminActivityRealtime";
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
        label: board.title ?? "Untitled board",
      })),
    [boards.data],
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
  useAdminActivityRealtime(
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
      <AdminShell title="Developer">
        <AdminEmpty>
          That developer could not be loaded.{" "}
          <Link to="/admin/users" className="text-brand">
            Back to the list
          </Link>
          .
        </AdminEmpty>
      </AdminShell>
    );
  }

  if (!data) {
    return (
      <AdminShell title="Developer">
        <AdminSkeleton />
      </AdminShell>
    );
  }

  const { user } = data;
  const started = startedNote(data.from);

  return (
    <AdminShell
      title={user.username}
      hint={`${user.full_name ?? user.email} · ${rangeLabel(data.from, data.to)}`}
      breadcrumb={<AdminCrumbs trail={userTrail(user.username)} />}
      actions={
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
        <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
          <SummaryCard
            title="This period"
            hint="Counted from rows, not configured"
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-3.5 pt-1 pb-3.5 sm:grid-cols-3">
              <Fact
                label="Completed tasks"
                value={dash(user.completed_todos)}
              />
              <Fact
                label="Completed points"
                value={dash(user.completed_points)}
                aside={
                  user.unestimated_completed > 0
                    ? `${user.unestimated_completed} unestimated`
                    : undefined
                }
              />
              <Fact label="Comments" value={dash(user.comments)} />
              <Fact label="Activity events" value={dash(user.activities)} />
              <Fact label="Boards" value={dash(user.boards)} />
              <Fact label="Level" value={user.seniority ?? "—"} />
            </dl>
          </SummaryCard>

          <BulletBar user={user} periodLabel={periodLabel(period)} />
        </div>

        <BarSeries
          points={data.series}
          bucket={data.bucket}
          title="This developer over time"
          note={backfillNote(data.from)}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-ink text-xs font-semibold tracking-tight">
            How long their work takes
          </h2>

          {/* A comparison, and named as one: /admin/flow has no person facet
              by design (D-23), so this link widens the population to everyone
              in the same scope. The two panels below are this person's. */}
          <Link
            to={`/admin/flow?period=${period}${scopeQuery(scope)}`}
            className="text-ink-3 hover:text-brand text-mini transition-colors"
          >
            Compare with system flow →
          </Link>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <FlowStats
            cycle={data.cycle_time}
            lead={data.lead_time}
            note={started}
          />

          <Histogram
            title="Their cycle time distribution"
            hint="Where this person's tail is, not just their median"
            bins={data.cycle_histogram}
            stats={data.cycle_time}
            className="xl:col-span-2"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
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
    </AdminShell>
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
    <div className="min-w-0">
      <dt className="text-ink-3 text-micro truncate font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-ink truncate text-lg font-semibold tabular-nums">
        {value}
      </dd>
      {aside && <p className="text-ink-3 text-mini truncate">{aside}</p>}
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
  const peak = peakOf(
    shares.map((share) => ({ count: share.completed_todos })),
  );
  const total = shares.reduce((sum, share) => sum + share.completed_todos, 0);

  return (
    <SummaryCard
      title="Where the work happened"
      hint="Completed tasks by board, for this period"
    >
      {shares.length === 0 ? (
        <WidgetEmpty>Nothing completed in this period.</WidgetEmpty>
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
                  {share.title ?? "Untitled board"}
                </Link>
              }
              title={share.title ?? "Untitled board"}
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
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-ink text-xs font-semibold tracking-tight">
            Recently completed
          </h2>
          <p className="text-ink-3 text-mini mt-0.5">
            The latest work credited to this person in the selected period
          </p>
        </div>

        <Link
          to={activityHref}
          className="text-ink-3 hover:text-brand text-mini shrink-0 transition-colors"
        >
          See their activity →
        </Link>
      </div>

      <AdminGrid columns={RECENT_COLUMNS} label="Recently completed work">
        <AdminRow header>
          <AdminCell header>Key</AdminCell>
          <AdminCell header>Title</AdminCell>
          <AdminCell header>Board</AdminCell>
          <AdminCell header align="right">
            Points
          </AdminCell>
          <AdminCell header align="right">
            Cycle
          </AdminCell>
        </AdminRow>

        {rows.length === 0 ? (
          <AdminEmpty>Nothing completed in this period.</AdminEmpty>
        ) : (
          rows.map((row) => (
            <AdminRow key={row.id} onOpen={() => onOpen(row.id)}>
              <AdminCell>
                <span className="text-ink-3 text-micro tabular-nums">
                  {taskKey(row.key_prefix, row.board_key) ?? "—"}
                </span>
              </AdminCell>

              <AdminCell>
                <span
                  className="text-ink truncate"
                  title={row.title ?? undefined}
                >
                  {row.title ?? "Untitled"}
                </span>
              </AdminCell>

              <AdminCell>
                <span className="text-ink-3 truncate">
                  {row.board_title ?? "Untitled board"}
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
    </section>
  );
}
