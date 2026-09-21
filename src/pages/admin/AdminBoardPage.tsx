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
import { boardTrail, taskTarget } from "@/services/admin/drilldown";
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
      title={row?.title ?? "Board"}
      hint={
        board.data
          ? `${row?.key_prefix ?? ""} · ${rangeLabel(board.data.from, board.data.to)}`
          : "Board analytics"
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
        <AdminEmpty>That board could not be loaded.</AdminEmpty>
      ) : board.data === undefined || row === undefined ? (
        <AdminSkeleton />
      ) : (
        <div className="flex flex-col gap-3">
          <KpiTiles
            items={[
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
              { key: "members", label: "Members", value: dash(row.members) },
              {
                key: "cycle",
                label: "Median cycle",
                value: formatDuration(row.median_cycle_days),
                aside: row.owner_username
                  ? `owner ${row.owner_username}`
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
                />
                <CumulativeFlow
                  points={flow.data.cfd}
                  bucket={flow.data.bucket}
                  windowTo={flow.data.to}
                  scopeQuery={`&board=${id}`}
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
                  hint="Where this board's tail is"
                  bins={flow.data.cycle_histogram}
                  stats={flow.data.cycle_time}
                  className="xl:col-span-2"
                />
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <WipStrip
                  slices={flow.data.wip}
                  scopeHint="Open cards on this board, by column"
                />
                <AgingBuckets buckets={flow.data.wip_aging} />
              </div>
            </>
          )}

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
                  to={`/admin/activity?board=${id}&period=${period}`}
                  className="text-ink-3 hover:text-brand text-mini transition-colors"
                >
                  See all →
                </Link>
              </div>

              <AdminGrid
                columns="minmax(6rem,1fr) minmax(7rem,1fr) minmax(9rem,2fr) 5rem"
                label="Recent activity on this board"
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

          <p className={cn("text-ink-3 text-mini")}>
            Completion rate{" "}
            {percent(
              row.todos === 0 ? null : (row.completed_todos / row.todos) * 100,
            )}{" "}
            over {dash(row.todos)} countable cards.
          </p>
        </div>
      )}

      {taskId && <AdminTaskPanel todoId={taskId} onClose={closeTask} />}
    </AdminShell>
  );
}
