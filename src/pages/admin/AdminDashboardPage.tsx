import AdminShell from "@/components/admin/AdminShell";
import StatTiles from "@/components/admin/StatTiles";
import { AdminEmpty } from "@/components/admin/AdminTable";
import Loading from "@/components/loading/LoadingPage";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useAdminOverview } from "@/services/admin/useAdmin";
import { rangeLabel } from "@/services/admin/format";

export default function AdminDashboardPage() {
  const { period } = useAdminPeriod();
  const { data, isLoading, error } = useAdminOverview(period);

  if (isLoading) return <Loading />;

  return (
    <AdminShell
      title="System overview"
      hint={
        data
          ? `${rangeLabel(data.from, data.to)} · buckets in ${data.timezone}`
          : "Everything, everywhere"
      }
    >
      {error || !data ? (
        <AdminEmpty>That did not load. Try again.</AdminEmpty>
      ) : (
        <div className="flex flex-col gap-4">
          <StatTiles totals={data.totals} />
        </div>
      )}
    </AdminShell>
  );
}
