import { useState } from "react";

import AdminShell from "@/components/admin/AdminShell";
import { AdminEmpty } from "@/components/admin/AdminTable";
import Loading from "@/components/loading/LoadingPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SummaryCard from "@/components/summary/SummaryCard";
import { useAdminKpi, useSaveKpiTarget } from "@/services/admin/useAdmin";
import type { KpiTarget } from "@/services/admin/types";
import { relativeTime } from "@/utils/relativeTime";

export default function AdminKpiPage() {
  const { data, isLoading, error } = useAdminKpi();

  if (isLoading) return <Loading />;

  const targets = data?.targets ?? [];

  return (
    <AdminShell
      title="KPI settings"
      hint="Targets are data, not defaults in code. Every number here is editable."
      showPeriod={false}
    >
      {error ? (
        <AdminEmpty>That did not load. Try again.</AdminEmpty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {targets.map((target) => (
            <TargetCard key={target.seniority} target={target} />
          ))}
        </div>
      )}

      <p className="text-ink-3 mt-5 max-w-prose text-xs">
        A developer with no level has no target, shows “—” rather than 0%, and
        is left out of KPI aggregates rather than counted as zero. Levels are
        assigned on a developer’s own page. Factual metrics — completed tasks,
        points, comments, activity — never depend on anything configured here.
      </p>
    </AdminShell>
  );
}

function TargetCard({ target }: { target: KpiTarget }) {
  const save = useSaveKpiTarget();
  const [daily, setDaily] = useState(String(target.daily_points));
  const [weekly, setWeekly] = useState(String(target.weekly_points));

  const dirty =
    Number(daily) !== target.daily_points ||
    Number(weekly) !== target.weekly_points;

  const valid = isNonNegative(daily) && isNonNegative(weekly);

  return (
    <SummaryCard
      title={capitalise(target.seniority)}
      hint={
        target.updated_by_username
          ? `Set by ${target.updated_by_username} ${relativeTime(target.updated_at)}`
          : "Seeded, never edited"
      }
    >
      <form
        className="flex flex-col gap-3 px-3.5 pt-1 pb-3.5"
        onSubmit={(event) => {
          event.preventDefault();

          if (!valid || !dirty) return;

          save.mutate({
            seniority: target.seniority,
            daily_points: Number(daily),
            weekly_points: Number(weekly),
          });
        }}
      >
        <Field label="Points per day" value={daily} onChange={setDaily} />
        <Field label="Points per week" value={weekly} onChange={setWeekly} />

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={!dirty || !valid || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>

          {!valid && (
            <span className="text-status-red text-mini">
              Must be zero or more.
            </span>
          )}
        </div>
      </form>
    </SummaryCard>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-ink-2 text-xs">{label}</span>
      <Input
        type="number"
        min={0}
        step="0.5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-24 text-right tabular-nums"
      />
    </label>
  );
}

function isNonNegative(value: string): boolean {
  const parsed = Number(value);

  return value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
