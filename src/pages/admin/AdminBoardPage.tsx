import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Link, useParams } from "react-router";

import AdminPage from "@/components/admin/AdminPage";
import { AdminEmpty, AdminSkeleton } from "@/components/admin/AdminTable";
import AdminTaskPanel from "@/components/admin/AdminTaskPanel";
import AgingBuckets from "@/components/admin/AgingBuckets";
import CumulativeFlow from "@/components/admin/CumulativeFlow";
import DualSeries from "@/components/admin/DualSeries";
import FlowStats from "@/components/admin/FlowStats";
import Histogram from "@/components/admin/Histogram";
import KpiTiles from "@/components/admin/KpiTiles";
import RecentActivityCard from "@/components/admin/RecentActivityCard";
import WipStrip from "@/components/admin/WipStrip";
import SummaryCard, {
  DistributionRow,
  WidgetEmpty,
} from "@/components/summary/SummaryCard";
import { useAdminFeedScope } from "@/hooks/useAdminActivityRealtime";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useOpenTask } from "@/hooks/useOpenTask";
import { boardTrail, scopeQuery } from "@/services/admin/drilldown";
import { startedNote } from "@/services/admin/backfill";
import { barShare, peakOf, proportionOf } from "@/services/admin/flow";
import {
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

  useAdminFeedScope({ board: id }, taskId);

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
    <AdminPage
      title={row?.title ?? t("sidebar.board")}
      description={
        board.data
          ? [
              row?.key_prefix,
              row?.owner_username
                ? t("admin.ownerNamed", { name: row.owner_username })
                : null,
              rangeLabel(board.data.from, board.data.to),
            ]
              .filter(Boolean)
              .join(" · ")
          : t("admin.board.analytics")
      }
      trail={boardTrail({
        title: row?.title ?? null,
        space_id: row?.space_id ?? null,
        space_title: row?.space_title ?? null,
      })}
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
                aside: t("admin.ofTotalRate", {
                  total: dash(row.todos),
                  rate: percent(
                    row.todos === 0
                      ? null
                      : Math.round((row.completed_todos / row.todos) * 100),
                  ),
                }),
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

              <div className="grid items-start gap-3 xl:grid-cols-2">
                <WipStrip
                  slices={flow.data.wip}
                  scopeHint={t("admin.board.wipHint")}
                />
                <AgingBuckets buckets={flow.data.wip_aging} />
              </div>
            </>
          )}

          <div className="grid items-start gap-3 xl:grid-cols-[22rem_minmax(0,1fr)]">
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

            <RecentActivityCard
              rows={recent}
              loading={activity.data === undefined}
              label={t("admin.board.recentLabel")}
              seeAll={`/admin/activity?board=${id}&period=${period}`}
              onOpen={openTask}
              showBoard={false}
            />
          </div>
        </div>
      )}

      {taskId && <AdminTaskPanel todoId={taskId} onClose={closeTask} />}
    </AdminPage>
  );
}
