import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";

import AdminPage from "@/components/admin/AdminPage";
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
import RecentActivityCard from "@/components/admin/RecentActivityCard";
import WipStrip from "@/components/admin/WipStrip";
import SummaryCard, {
  DistributionRow,
  WidgetEmpty,
} from "@/components/summary/SummaryCard";
import { useAdminFeedScope } from "@/hooks/useAdminActivityRealtime";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useOpenTask } from "@/hooks/useOpenTask";
import { scopeQuery, spaceTrail } from "@/services/admin/drilldown";
import { startedNote } from "@/services/admin/backfill";
import { barShare, peakOf, proportionOf } from "@/services/admin/flow";
import {
  dash,
  formatDuration,
  percent,
  rangeLabel,
} from "@/services/admin/format";
import { sortBoards } from "@/services/admin/leaderboard";
import { sortUsers } from "@/services/admin/sortUsers";
import {
  useAdminActivity,
  useAdminFlow,
  useAdminSpace,
  useAdminUsers,
} from "@/services/admin/useAdmin";

const CONTRIBUTORS = 6;
const RECENT = 8;
const BOARD_COLUMNS = "minmax(9rem,1.8fr) repeat(5, minmax(4.5rem,1fr))";

export default function AdminSpacePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { period } = useAdminPeriod();
  const { taskId, openTask, closeTask } = useOpenTask();
  const navigate = useNavigate();

  const space = useAdminSpace(id, period);
  const flow = useAdminFlow({ period, space: id });
  const people = useAdminUsers(period, { space: id });
  const activity = useAdminActivity({ period, space: id });

  const row = space.data?.space;
  const boards = useMemo(
    () => sortBoards(space.data?.boards ?? [], "completed_todos"),
    [space.data],
  );

  const contributors = useMemo(
    () =>
      sortUsers(people.data?.users ?? [], "completed_todos")
        .filter((person) => person.completed_todos > 0)
        .slice(0, CONTRIBUTORS),
    [people.data],
  );

  useAdminFeedScope(
    { space: id, spaceBoardIds: boards.map((board) => board.id) },
    taskId,
  );

  const recent = (activity.data?.pages ?? [])
    .flatMap((page) => page.activities)
    .slice(0, RECENT);
  const note =
    flow.data === undefined ? undefined : startedNote(flow.data.from);

  return (
    <AdminPage
      title={row?.title ?? t("boards.space")}
      description={
        space.data
          ? [
              t("admin.boards.hint", {
                count: row?.boards ?? 0,
                range: rangeLabel(space.data.from, space.data.to),
              }),
              row?.owner_username
                ? t("admin.ownerNamed", { name: row.owner_username })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : t("admin.space.analytics")
      }
      trail={spaceTrail({ title: row?.title ?? t("boards.space") })}
    >
      {space.error ? (
        <AdminEmpty>{t("admin.space.loadFailed")}</AdminEmpty>
      ) : space.data === undefined || row === undefined ? (
        <AdminSkeleton />
      ) : (
        <div className="flex flex-col gap-3">
          <KpiTiles
            items={[
              {
                key: "boards",
                label: t("boards.title"),
                value: dash(row.boards),
              },
              {
                key: "people",
                label: t("admin.sections.users"),
                value: dash(row.members),
              },
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
                  scopeQuery={scopeQuery({ space: id })}
                />
                <CumulativeFlow
                  points={flow.data.cfd}
                  bucket={flow.data.bucket}
                  windowTo={flow.data.to}
                  scopeQuery={scopeQuery({ space: id })}
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
                  hint={t("admin.space.histogramHint")}
                  bins={flow.data.cycle_histogram}
                  stats={flow.data.cycle_time}
                  className="xl:col-span-2"
                />
              </div>

              <div className="grid items-start gap-3 xl:grid-cols-2">
                <WipStrip
                  slices={flow.data.wip}
                  scopeHint={t("admin.space.wipHint")}
                />
                <AgingBuckets buckets={flow.data.wip_aging} />
              </div>
            </>
          )}

          <SummaryCard
            title={t("admin.space.comparison")}
            hint={t("admin.space.comparisonHint")}
          >
            <AdminGrid
              columns={BOARD_COLUMNS}
              label={t("admin.space.boardsLabel")}
              embedded
            >
              <AdminRow header>
                <AdminCell header>{t("sidebar.board")}</AdminCell>
                <AdminCell header align="right">
                  {t("admin.columns.open")}
                </AdminCell>
                <AdminCell header align="right">
                  {t("columnCategory.done")}
                </AdminCell>
                <AdminCell header align="right">
                  {t("admin.columns.points")}
                </AdminCell>
                <AdminCell header align="right">
                  {t("admin.columns.cycle")}
                </AdminCell>
                <AdminCell header align="right">
                  {t("board.members")}
                </AdminCell>
              </AdminRow>

              {boards.length === 0 ? (
                <AdminEmpty>{t("admin.space.noBoards")}</AdminEmpty>
              ) : (
                boards.map((board) => (
                  <AdminRow
                    key={board.id}
                    onOpen={() =>
                      void navigate(
                        `/admin/boards/${board.id}?period=${period}`,
                      )
                    }
                  >
                    <AdminCell>
                      <span className="text-ink truncate font-medium">
                        {board.title ?? t("common.untitledBoard")}
                      </span>
                    </AdminCell>
                    <AdminCell align="right">
                      {dash(board.open_todos)}
                    </AdminCell>
                    <AdminCell align="right">
                      {dash(board.completed_todos)}
                    </AdminCell>
                    <AdminCell align="right">
                      {dash(board.completed_points)}
                    </AdminCell>
                    <AdminCell align="right">
                      <span
                        className={
                          board.median_cycle_days === null
                            ? "text-ink-3"
                            : undefined
                        }
                      >
                        {formatDuration(board.median_cycle_days)}
                      </span>
                    </AdminCell>
                    <AdminCell align="right">{dash(board.members)}</AdminCell>
                  </AdminRow>
                ))
              )}
            </AdminGrid>
          </SummaryCard>

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
              label={t("admin.space.recentLabel")}
              seeAll={`/admin/activity?space=${id}&period=${period}`}
              onOpen={openTask}
            />
          </div>
        </div>
      )}

      {taskId && <AdminTaskPanel todoId={taskId} onClose={closeTask} />}
    </AdminPage>
  );
}
