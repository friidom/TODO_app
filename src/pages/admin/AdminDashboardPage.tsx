import { Link } from "react-router";

import AdminShell from "@/components/admin/AdminShell";
import AdminTaskPanel from "@/components/admin/AdminTaskPanel";
import BarSeries from "@/components/admin/BarSeries";
import BoardLoad from "@/components/admin/BoardLoad";
import SpaceLoad from "@/components/admin/SpaceLoad";
import StatTiles from "@/components/admin/StatTiles";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import { useAdminActivityRealtime } from "@/hooks/useAdminActivityRealtime";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useOpenTask } from "@/hooks/useOpenTask";
import {
  useAdminActivity,
  useAdminBoards,
  useAdminFlow,
  useAdminOverview,
  useAdminSpaces,
} from "@/services/admin/useAdmin";
import { actionLabel, rangeLabel } from "@/services/admin/format";
import { backfillNote } from "@/services/admin/backfill";
import { taskTarget } from "@/services/admin/drilldown";
import { DEFAULT_FLOW_SLICE } from "@/services/admin/types";
import type { AdminActivityRow } from "@/services/admin/types";
import { relativeTime } from "@/utils/relativeTime";
import { taskKey } from "@/utils/taskKey";

const RECENT = 8;

export default function AdminDashboardPage() {
  const { period } = useAdminPeriod();
  const { taskId, openTask, closeTask } = useOpenTask();

  const { data, isFetching, error } = useAdminOverview(period);
  const { data: boards } = useAdminBoards(period);
  const { data: spaces } = useAdminSpaces(period);
  // Unsliced, so this keys the same cache entry the Flow page already fills.
  const flow = useAdminFlow({ period, slice: DEFAULT_FLOW_SLICE });
  const activity = useAdminActivity({ period });

  useAdminActivityRealtime({}, taskId);

  const recent = (activity.data?.pages ?? [])
    .flatMap((page) => page.activities)
    .slice(0, RECENT);

  return (
    <AdminShell
      title="System overview"
      hint={
        data
          ? `${rangeLabel(data.from, data.to)} · buckets in ${data.timezone}`
          : "Everything, everywhere"
      }
      busy={isFetching}
    >
      {error ? (
        <AdminEmpty>That did not load. Try again.</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <StatTiles totals={data.totals} cycle={flow.data?.cycle_time} />

          <BarSeries
            points={data.series}
            bucket={data.bucket}
            note={backfillNote(data.from)}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <BoardLoad boards={boards?.boards ?? []} period={period} />
            <SpaceLoad spaces={spaces?.spaces ?? []} period={period} />
          </div>

          <RecentActivity
            rows={recent}
            period={period}
            onOpen={openTask}
            loading={activity.data === undefined}
          />
        </div>
      )}

      {taskId && <AdminTaskPanel todoId={taskId} onClose={closeTask} />}
    </AdminShell>
  );
}

const RECENT_COLUMNS =
  "minmax(6rem,1fr) minmax(7rem,1fr) minmax(10rem,2fr) minmax(8rem,1fr) 5rem";

function RecentActivity({
  rows,
  period,
  onOpen,
  loading,
}: {
  rows: AdminActivityRow[];
  period: string;
  onOpen: (todoId: string) => void;
  loading: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-ink text-xs font-semibold tracking-tight">
          Recent activity
        </h2>

        <Link
          to={`/admin/activity?period=${period}`}
          className="text-ink-3 hover:text-brand text-mini transition-colors"
        >
          See all →
        </Link>
      </div>

      {loading ? (
        <AdminSkeleton rows={RECENT} />
      ) : (
        <AdminGrid columns={RECENT_COLUMNS} label="Recent activity system-wide">
          <AdminRow header>
            <AdminCell header>Developer</AdminCell>
            <AdminCell header>Action</AdminCell>
            <AdminCell header>Item</AdminCell>
            <AdminCell header>Board</AdminCell>
            <AdminCell header align="right">
              When
            </AdminCell>
          </AdminRow>

          {rows.length === 0 ? (
            <AdminEmpty>Nothing happened in this window.</AdminEmpty>
          ) : (
            rows.map((entry) => (
              <AdminRow
                key={entry.id}
                onOpen={
                  taskTarget(entry) === null
                    ? undefined
                    : () => onOpen(taskTarget(entry)!)
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

                <AdminCell>
                  <span className="text-ink-3 truncate">
                    {entry.board_title ?? "—"}
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
      )}
    </section>
  );
}
