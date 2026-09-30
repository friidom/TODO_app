import { useTranslation } from "react-i18next";
import { useState } from "react";

import AdminShell from "@/components/admin/AdminShell";
import { AdminEmpty, AdminSkeleton } from "@/components/admin/AdminTable";
import AuditLog from "@/components/admin/AuditLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SummaryCard from "@/components/summary/SummaryCard";
import { useAdminKpi, useSaveKpiTarget } from "@/services/admin/useAdmin";
import type { KpiTarget } from "@/services/admin/types";
import { relativeTime } from "@/utils/relativeTime";

export default function AdminKpiPage() {
  const { t } = useTranslation();
  const { data, isFetching, error } = useAdminKpi();

  const targets = data?.targets ?? [];

  return (
    <AdminShell
      title={t("admin.sections.kpi")}
      hint={t("admin.kpi.hint")}
      showPeriod={false}
      busy={isFetching}
    >
      {error ? (
        <AdminEmpty>{t("admin.loadFailedRetry")}</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton rows={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {targets.map((target) => (
            <TargetCard key={target.seniority} target={target} />
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <p className="text-ink-3 max-w-prose text-xs">
          {t("admin.kpi.explainer")}
        </p>

        <AuditLog />
      </div>
    </AdminShell>
  );
}

function TargetCard({ target }: { target: KpiTarget }) {
  const { t } = useTranslation();
  const save = useSaveKpiTarget();
  const [daily, setDaily] = useState(String(target.daily_points));
  const [weekly, setWeekly] = useState(String(target.weekly_points));

  const dirty =
    Number(daily) !== target.daily_points ||
    Number(weekly) !== target.weekly_points;

  const valid = isNonNegative(daily) && isNonNegative(weekly);

  return (
    <SummaryCard
      title={t(`admin.seniority.${target.seniority}`, {
        defaultValue: capitalise(target.seniority),
      })}
      hint={
        target.updated_by_username
          ? t("admin.kpi.setBy", {
              name: target.updated_by_username,
              when: relativeTime(target.updated_at),
            })
          : t("admin.kpi.seeded")
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
        <Field
          label={t("admin.kpi.perDay")}
          value={daily}
          onChange={setDaily}
        />
        <Field
          label={t("admin.kpi.perWeek")}
          value={weekly}
          onChange={setWeekly}
        />

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={!dirty || !valid || save.isPending}
          >
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>

          {!valid && (
            <span className="text-status-red text-mini">
              {t("admin.kpi.nonNegative")}
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
