import AdminShell from "@/components/admin/AdminShell";
import BarSeries from "@/components/admin/BarSeries";
import BoardLoad from "@/components/admin/BoardLoad";
import StatTiles from "@/components/admin/StatTiles";
import { AdminEmpty, AdminSkeleton } from "@/components/admin/AdminTable";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useAdminBoards, useAdminOverview } from "@/services/admin/useAdmin";
import { rangeLabel } from "@/services/admin/format";
import { backfillNote } from "@/services/admin/backfill";

export default function AdminDashboardPage() {
  const { period } = useAdminPeriod();
  const { data, isFetching, error } = useAdminOverview(period);
  const { data: boards } = useAdminBoards(period);

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
          <StatTiles totals={data.totals} />

          <BarSeries
            points={data.series}
            bucket={data.bucket}
            note={backfillNote(data.from)}
          />

          <BoardLoad boards={boards?.boards ?? []} />
        </div>
      )}
    </AdminShell>
  );
}
