import { Link, useParams } from "react-router";

import AdminShell from "@/components/admin/AdminShell";
import BarSeries from "@/components/admin/BarSeries";
import BulletBar from "@/components/admin/BulletBar";
import ContributionHeatmap from "@/components/admin/ContributionHeatmap";
import SeniorityControl from "@/components/admin/SeniorityControl";
import { AdminEmpty } from "@/components/admin/AdminTable";
import Loading from "@/components/loading/LoadingPage";
import SummaryCard from "@/components/summary/SummaryCard";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useAdminUser } from "@/services/admin/useAdmin";
import { dash, rangeLabel } from "@/services/admin/format";
import { backfillNote } from "@/services/admin/backfill";
import { periodLabel } from "@/services/admin/periods";

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const { period } = useAdminPeriod();
  const { data, isLoading, error } = useAdminUser(id, period);

  if (isLoading) return <Loading />;

  if (error || !data) {
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

  const { user } = data;

  return (
    <AdminShell
      title={user.username}
      hint={`${user.full_name ?? user.email} · ${rangeLabel(data.from, data.to)}`}
      actions={<SeniorityControl user={user} />}
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

        <ContributionHeatmap
          from={data.heatmap.from}
          to={data.heatmap.to}
          cells={data.heatmap.cells}
        />
      </div>
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
