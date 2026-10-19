import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";

import AdminPage from "@/components/admin/AdminPage";
import AdminTaskPanel from "@/components/admin/AdminTaskPanel";
import AgingBuckets from "@/components/admin/AgingBuckets";
import AuditLog from "@/components/admin/AuditLog";
import BarSeries from "@/components/admin/BarSeries";
import BoardLoad from "@/components/admin/BoardLoad";
import RecentActivityCard from "@/components/admin/RecentActivityCard";
import SpaceLoad from "@/components/admin/SpaceLoad";
import StatTiles from "@/components/admin/StatTiles";
import WipStrip from "@/components/admin/WipStrip";
import { AdminEmpty, AdminSkeleton } from "@/components/admin/AdminTable";
import { useAdminFeedScope } from "@/hooks/useAdminActivityRealtime";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useOpenTask } from "@/hooks/useOpenTask";
import {
  useAdminAccounts,
  useAdminActivity,
  useAdminBoards,
  useAdminFlow,
  useAdminOverview,
  useAdminSpaces,
} from "@/services/admin/useAdmin";
import { dash, percent, rangeLabel } from "@/services/admin/format";
import { attentionItems, type AttentionItem } from "@/services/admin/attention";
import { backfillNote } from "@/services/admin/backfill";
import { sectionForPath } from "@/services/admin/registry";
import { DEFAULT_FLOW_SLICE } from "@/services/admin/types";

const RECENT = 8;

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { period } = useAdminPeriod();
  const { taskId, openTask, closeTask } = useOpenTask();

  const { data, error } = useAdminOverview(period);
  const { data: boards } = useAdminBoards(period);
  const { data: spaces } = useAdminSpaces(period);
  // Unsliced, so this keys the same cache entry the Flow page already fills.
  const flow = useAdminFlow({ period, slice: DEFAULT_FLOW_SLICE });
  const activity = useAdminActivity({ period });
  const accounts = useAdminAccounts("");

  useAdminFeedScope({}, taskId);

  const recent = (activity.data?.pages ?? [])
    .flatMap((page) => page.activities)
    .slice(0, RECENT);

  return (
    <AdminPage
      title={t("admin.dashboard.title")}
      description={
        data
          ? t("admin.dashboard.hint", {
              range: rangeLabel(data.from, data.to),
              timezone: data.timezone,
            })
          : t("admin.dashboard.hintLoading")
      }
    >
      {error ? (
        <AdminEmpty>{t("admin.loadFailedRetry")}</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <Attention
            items={attentionItems(
              accounts.data?.active_superadmins,
              flow.data?.wip_aging,
            )}
          />

          <StatTiles totals={data.totals} cycle={flow.data?.cycle_time} />

          <BarSeries
            points={data.series}
            bucket={data.bucket}
            note={backfillNote(data.from)}
          />

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <BoardLoad boards={boards?.boards ?? []} period={period} />
            <SpaceLoad spaces={spaces?.spaces ?? []} period={period} />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <AuditLog />

            {flow.data && (
              <div className="flex min-w-0 flex-col gap-4">
                <WipStrip slices={flow.data.wip} />
                <AgingBuckets buckets={flow.data.wip_aging} />
              </div>
            )}
          </div>

          <RecentActivityCard
            rows={recent}
            loading={activity.data === undefined}
            label={t("admin.dashboard.recentLabel")}
            seeAll={`/admin/activity?period=${period}`}
            onOpen={openTask}
          />
        </div>
      )}

      {taskId && <AdminTaskPanel todoId={taskId} onClose={closeTask} />}
    </AdminPage>
  );
}

// Neutral, not tinted: these are things to look at, not alarms. The count
// leads each line so the panel reads at a glance.
function Attention({ items }: { items: AttentionItem[] }) {
  const { t } = useTranslation();

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="admin-attention"
      className="border-hairline bg-surface rounded-card overflow-hidden border"
    >
      <h2
        id="admin-attention"
        className="text-ink flex items-center gap-2 px-4 pt-3 pb-2 text-sm font-medium"
      >
        <TriangleAlertIcon
          className="text-status-orange size-4 shrink-0"
          aria-hidden
        />
        {t("admin.attention.title")}
      </h2>

      <ul className="border-hairline divide-hairline divide-y border-t">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.to}
              className="hover:bg-wash focus-visible:ring-brand group flex items-baseline gap-3 px-4 py-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <span className="text-ink w-10 shrink-0 text-right text-base font-semibold tabular-nums">
                {dash(item.count)}
              </span>

              <span className="text-meta min-w-0 flex-1">
                <span className="text-ink">
                  {t(`admin.attention.items.${item.key}`, {
                    count: item.count,
                  })}
                </span>
                {item.of !== undefined && item.of > 0 && (
                  <span className="text-ink-3">
                    {" · "}
                    {t("admin.attention.share", {
                      percent: percent(
                        Math.round((item.count / item.of) * 100),
                      ),
                      total: dash(item.of),
                    })}
                  </span>
                )}
              </span>

              <span className="text-ink-3 group-hover:text-brand text-mini hidden shrink-0 items-center gap-0.5 transition-colors sm:flex">
                {sectionForPath(item.to).label}
                <ChevronRightIcon className="size-3.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
