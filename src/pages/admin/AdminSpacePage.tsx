import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";

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
import { scopeQuery, spaceTrail, taskTarget } from "@/services/admin/drilldown";
import { startedNote } from "@/services/admin/backfill";
import { barShare, peakOf, proportionOf } from "@/services/admin/flow";
import {
  actionLabel,
  dash,
  formatDuration,
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
import { relativeTime } from "@/utils/relativeTime";
import { taskKey } from "@/utils/taskKey";

const CONTRIBUTORS = 6;
const RECENT = 8;
const BOARD_COLUMNS = "minmax(9rem,1.8fr) repeat(5, minmax(4.5rem,1fr))";

export default function AdminSpacePage() {
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

  useAdminActivityRealtime(
    { space: id, spaceBoardIds: boards.map((board) => board.id) },
    taskId,
  );

  const recent = (activity.data?.pages ?? [])
    .flatMap((page) => page.activities)
    .slice(0, RECENT);
  const note =
    flow.data === undefined ? undefined : startedNote(flow.data.from);

  return (
    <AdminShell
      title={row?.title ?? "Space"}
      hint={
        space.data
          ? `${dash(row?.boards ?? 0)} boards · ${rangeLabel(space.data.from, space.data.to)}`
          : "Space analytics"
      }
      busy={space.isFetching || flow.isFetching}
      breadcrumb={
        <AdminCrumbs trail={spaceTrail({ title: row?.title ?? "Space" })} />
      }
    >
      {space.error ? (
        <AdminEmpty>That space could not be loaded.</AdminEmpty>
      ) : space.data === undefined || row === undefined ? (
        <AdminSkeleton />
      ) : (
        <div className="flex flex-col gap-3">
          <KpiTiles
            items={[
              { key: "boards", label: "Boards", value: dash(row.boards) },
              { key: "people", label: "Developers", value: dash(row.members) },
              { key: "open", label: "Open", value: dash(row.open_todos) },
              {
                key: "done",
                label: "Completed",
                value: dash(row.completed_todos),
                aside: `of ${dash(row.todos)} total`,
              },
              {
                key: "points",
                label: "Points",
                value: dash(row.completed_points),
                aside:
                  row.unestimated_completed > 0
                    ? `${row.unestimated_completed} unestimated`
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
                  title="Cycle time distribution"
                  hint="Across every board in this space"
                  bins={flow.data.cycle_histogram}
                  stats={flow.data.cycle_time}
                  className="xl:col-span-2"
                />
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <WipStrip
                  slices={flow.data.wip}
                  scopeHint="Open cards across this space, by category"
                />
                <AgingBuckets buckets={flow.data.wip_aging} />
              </div>
            </>
          )}

          <section className="flex flex-col gap-2">
            <div>
              <h2 className="text-ink text-xs font-semibold tracking-tight">
                Board comparison
              </h2>
              <p className="text-ink-3 text-mini mt-0.5">
                How the boards in this space behave relative to one another
              </p>
            </div>

            <AdminGrid columns={BOARD_COLUMNS} label="Boards in this space">
              <AdminRow header>
                <AdminCell header>Board</AdminCell>
                <AdminCell header align="right">
                  Open
                </AdminCell>
                <AdminCell header align="right">
                  Done
                </AdminCell>
                <AdminCell header align="right">
                  Points
                </AdminCell>
                <AdminCell header align="right">
                  Cycle
                </AdminCell>
                <AdminCell header align="right">
                  Members
                </AdminCell>
              </AdminRow>

              {boards.length === 0 ? (
                <AdminEmpty>No boards are filed into this space.</AdminEmpty>
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
                        {board.title ?? "Untitled board"}
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
          </section>

          <div className="grid gap-3 xl:grid-cols-[22rem_1fr]">
            <SummaryCard
              title="Top contributors"
              hint="Completed work credited in this period"
            >
              {contributors.length === 0 ? (
                <WidgetEmpty>
                  Nobody completed work here in this window.
                </WidgetEmpty>
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
                  Recent activity
                </h2>
                <Link
                  to={`/admin/activity?space=${id}&period=${period}`}
                  className="text-ink-3 hover:text-brand text-mini transition-colors"
                >
                  See all →
                </Link>
              </div>

              <AdminGrid
                columns="minmax(6rem,1fr) minmax(7rem,1fr) minmax(9rem,2fr) 5rem"
                label="Recent activity in this space"
              >
                <AdminRow header>
                  <AdminCell header>Developer</AdminCell>
                  <AdminCell header>Action</AdminCell>
                  <AdminCell header>Item</AdminCell>
                  <AdminCell header align="right">
                    When
                  </AdminCell>
                </AdminRow>

                {recent.length === 0 ? (
                  <AdminEmpty>Nothing happened in this window.</AdminEmpty>
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
                          {entry.actor_username ?? "Unknown"}
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
                          {entry.title ?? `Untitled ${entry.entity_type}`}
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
        </div>
      )}

      {taskId && <AdminTaskPanel todoId={taskId} onClose={closeTask} />}
    </AdminShell>
  );
}
