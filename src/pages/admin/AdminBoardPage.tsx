import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Link, useParams } from "react-router";

import AdminCrumbs from "@/components/admin/AdminCrumbs";
import AdminShell from "@/components/admin/AdminShell";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import AdminTaskPanel from "@/components/admin/AdminTaskPanel";
import AgingBuckets from "@/components/admin/AgingBuckets";
import CumulativeFlow from "@/components/admin/CumulativeFlow";
import DualSeries from "@/components/admin/DualSeries";
import FlowStats from "@/components/admin/FlowStats";
import Histogram from "@/components/admin/Histogram";
import KpiTiles from "@/components/admin/KpiTiles";
import WipStrip from "@/components/admin/WipStrip";
import SummaryCard, {
  DistributionRow,
  WidgetEmpty,
} from "@/components/summary/SummaryCard";
import { useAdminActivityRealtime } from "@/hooks/useAdminActivityRealtime";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useOpenTask } from "@/hooks/useOpenTask";
import { boardTrail, scopeQuery, taskTarget } from "@/services/admin/drilldown";
import { startedNote } from "@/services/admin/backfill";
import { barShare, peakOf, proportionOf } from "@/services/admin/flow";
import {
  actionLabel,
  dash,
  formatDuration,
  percent,
  rangeLabel,
} from "@/services/admin/format";
import { sortUsers } from "@/services/admin/sortUsers";
import {
  useAdminActivity,
  useAdminBoard,
  useAdminFlow,
  useAdminUsers,
} from "@/services/admin/useAdmin";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";
import { taskKey } from "@/utils/taskKey";

const CONTRIBUTORS = 6;
const RECENT = 8;

export default function AdminBoardPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { period } = useAdminPeriod();
  const { taskId, openTask, closeTask } = useOpenTask();

  const board = useAdminBoard(id, period);
  const flow = useAdminFlow({ period, board: id });
  const people = useAdminUsers(period, { board: id });
  const activity = useAdminActivity({ period, board: id });

  useAdminActivityRealtime({ board: id }, taskId);

  const row = board.data?.board;

  const contributors = useMemo(
    () =>
      sortUsers(people.data?.users ?? [], "completed_todos")
        .filter((person) => person.completed_todos > 0)
        .slice(0, CONTRIBUTORS),
    [people.data],
  );

  const recent = (activity.data?.pages ?? [])
    .flatMap((page) => page.activities)
    .slice(0, RECENT);
  const note =
    flow.data === undefined ? undefined : startedNote(flow.data.from);

  return (
    <AdminShell
      title={row?.title ?? t("sidebar.board")}
      hint={
        board.data
          ? `${row?.key_prefix ?? ""} · ${rangeLabel(board.data.from, board.data.to)}`
          : t("admin.board.analytics")
      }
      busy={board.isFetching || flow.isFetching}
      breadcrumb={
        <AdminCrumbs
          trail={boardTrail({
            title: row?.title ?? null,
            space_id: row?.space_id ?? null,
            space_title: row?.space_title ?? null,
          })}
        />
      }
    >
      {board.error ? (
        <AdminEmpty>{t("admin.board.loadFailed")}</AdminEmpty>
      ) : board.data === undefined || row === undefined ? (
        <AdminSkeleton />
      ) : (
        <div className="flex flex-col gap-3">
          <KpiTiles
            items={[
              {
                key: "open",
                label: t("admin.columns.open"),
                value: dash(row.open_todos),
              },
              {
                key: "done",
                label: t("fields.completed"),
                value: dash(row.completed_todos),
                aside: t("admin.ofTotal", { total: dash(row.todos) }),
              },
              {
                key: "points",
                label: t("admin.columns.points"),
                value: dash(row.completed_points),
                aside:
                  row.unestimated_completed > 0
                    ? t("admin.unestimatedCount", {
                        count: row.unestimated_completed,
                      })
                    : undefined,
              },
              {
                key: "members",
                label: t("board.members"),
                value: dash(row.members),
              },
              {
                key: "cycle",
                label: t("admin.medianCycle"),
                value: formatDuration(row.median_cycle_days),
                aside: row.owner_username
                  ? t("admin.ownerNamed", { name: row.owner_username })
                  : undefined,
              },
            ]}
          />

          {flow.data === undefined ? (
            <AdminSkeleton rows={6} />
          ) : (
            <>
              <div className="grid gap-3 xl:grid-cols-2">
                <DualSeries
                  points={flow.data.series}
                  bucket={flow.data.bucket}
                  windowTo={flow.data.to}
                  scopeQuery={scopeQuery({ board: id })}
                />
                <CumulativeFlow
                  points={flow.data.cfd}
                  bucket={flow.data.bucket}
                  windowTo={flow.data.to}
                  scopeQuery={scopeQuery({ board: id })}
                  note={note}
                />
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <FlowStats
                  cycle={flow.data.cycle_time}
                  lead={flow.data.lead_time}
                  note={note}
                />
                <Histogram
                  title={t("admin.histogram.title")}
                  hint={t("admin.board.histogramHint")}
                  bins={flow.data.cycle_histogram}
                  stats={flow.data.cycle_time}
                  className="xl:col-span-2"
                />
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <WipStrip
                  slices={flow.data.wip}
                  scopeHint={t("admin.board.wipHint")}
                />
                <AgingBuckets buckets={flow.data.wip_aging} />
              </div>
            </>
          )}

          <div className="grid gap-3 xl:grid-cols-[22rem_1fr]">
            <SummaryCard
              title={t("admin.contributors.title")}
              hint={t("admin.contributors.hint")}
            >
              {contributors.length === 0 ? (
                <WidgetEmpty>{t("admin.contributors.empty")}</WidgetEmpty>
              ) : (
                <div className="flex flex-col gap-2 px-3.5 pb-3.5">
                  {contributors.map((person) => (
                    <DistributionRow
                      key={person.id}
                      label={
                        <Link
                          to={`/admin/users/${person.id}?period=${period}`}
                          className="hover:text-brand transition-colors"
                        >
                          {person.username}
                        </Link>
                      }
                      title={person.username}
                      count={person.completed_todos}
                      percent={barShare(
                        person.completed_todos,
                        peakOf(
                          contributors.map((c) => ({
                            count: c.completed_todos,
                          })),
                        ),
                      )}
                      share={proportionOf(
                        person.completed_todos,
                        row.completed_todos,
                      )}
                      barClassName="bg-brand/70"
                      labelClassName="flex-[0_0_7rem]"
                    />
                  ))}
                </div>
              )}
            </SummaryCard>

            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-ink text-xs font-semibold tracking-tight">
                  {t("admin.recentActivity")}
                </h2>
                <Link
                  to={`/admin/activity?board=${id}&period=${period}`}
                  className="text-ink-3 hover:text-brand text-mini transition-colors"
                >
                  {t("admin.seeAll")}
                </Link>
              </div>

              <AdminGrid
                columns="minmax(6rem,1fr) minmax(7rem,1fr) minmax(9rem,2fr) 5rem"
                label={t("admin.board.recentLabel")}
              >
                <AdminRow header>
                  <AdminCell header>{t("admin.columns.developer")}</AdminCell>
                  <AdminCell header>{t("admin.columns.action")}</AdminCell>
                  <AdminCell header>{t("admin.columns.item")}</AdminCell>
                  <AdminCell header align="right">
                    {t("admin.columns.when")}
                  </AdminCell>
                </AdminRow>

                {recent.length === 0 ? (
                  <AdminEmpty>{t("admin.nothingHappened")}</AdminEmpty>
                ) : (
                  recent.map((entry) => (
                    <AdminRow
                      key={entry.id}
                      onOpen={
                        taskTarget(entry) === null
                          ? undefined
                          : () => openTask(taskTarget(entry)!)
                      }
                    >
                      <AdminCell>
                        <span className="text-ink truncate">
                          {entry.actor_username ?? t("admin.unknown")}
                        </span>
                      </AdminCell>
                      <AdminCell>
                        <span className="text-ink-2 truncate">
                          {actionLabel(entry.action)}
                        </span>
                      </AdminCell>
                      <AdminCell>
                        {taskKey(entry.key_prefix, entry.board_key) && (
                          <span className="text-ink-3 text-micro mr-1.5 tabular-nums">
                            {taskKey(entry.key_prefix, entry.board_key)}
                          </span>
                        )}
                        <span className="text-ink-2 truncate">
                          {entry.title ?? t("common.untitled")}
                        </span>
                      </AdminCell>
                      <AdminCell align="right">
                        <span
                          className="text-ink-3 text-micro"
                          title={entry.created_at}
                        >
                          {relativeTime(entry.created_at)}
                        </span>
                      </AdminCell>
                    </AdminRow>
                  ))
                )}
              </AdminGrid>
            </section>
          </div>

          <p className={cn("text-ink-3 text-mini")}>
            {t("admin.board.completionRate", {
              rate: percent(
                row.todos === 0
                  ? null
                  : (row.completed_todos / row.todos) * 100,
              ),
              total: dash(row.todos),
            })}
          </p>
        </div>
      )}

      {taskId && <AdminTaskPanel todoId={taskId} onClose={closeTask} />}
    </AdminShell>
  );
}
