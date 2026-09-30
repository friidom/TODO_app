import { useTranslation } from "react-i18next";
import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import { hasDurations } from "@/services/admin/flow";
import { formatDuration } from "@/services/admin/format";
import type { DurationStats } from "@/services/admin/types";

export default function FlowStats({
  cycle,
  lead,
  note,
  className,
}: {
  cycle: DurationStats;
  lead: DurationStats;
  note?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const rows = [
    {
      key: "cycle",
      label: t("admin.flowStats.cycle"),
      hint: t("admin.flowStats.cycleHint"),
      stats: cycle,
    },
    {
      key: "lead",
      label: t("admin.flowStats.lead"),
      hint: t("admin.flowStats.leadHint"),
      stats: lead,
    },
  ];

  const anything = hasDurations(cycle) || hasDurations(lead);

  return (
    <SummaryCard
      title={t("admin.flowStats.title")}
      hint={t("admin.flowStats.hint")}
      className={className}
    >
      {!anything ? (
        <WidgetEmpty>{t("admin.noDurations")}</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-3 px-3.5 pb-3.5">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-ink text-xs font-medium">
                  {row.label}
                </span>
                <span className="text-ink-3 text-mini truncate">
                  {row.hint}
                </span>
              </div>

              <dl className="mt-1.5 flex gap-4">
                <Figure
                  label={t("admin.median")}
                  value={row.stats.median_days}
                  lead
                />
                <Figure label="p75" value={row.stats.p75_days} />
                <Figure label="p90" value={row.stats.p90_days} />
              </dl>

              <p className="text-ink-3 text-micro mt-1 tabular-nums">
                {t("admin.flowStats.measured", { count: row.stats.n })}
                {row.stats.unmeasured > 0 &&
                  ` · ${t("admin.flowStats.unmeasured", {
                    count: row.stats.unmeasured,
                  })}`}
              </p>
            </div>
          ))}

          {note && <p className="text-ink-3 text-mini">{note}</p>}
        </div>
      )}
    </SummaryCard>
  );
}

function Figure({
  label,
  value,
  lead = false,
}: {
  label: string;
  value: number | null;
  lead?: boolean;
}) {
  return (
    <div>
      <dd
        className={
          lead
            ? "text-ink text-lg leading-tight font-semibold tabular-nums"
            : "text-ink-2 text-sm leading-tight font-medium tabular-nums"
        }
      >
        {formatDuration(value)}
      </dd>
      <dt className="text-ink-3 text-micro mt-0.5">{label}</dt>
    </div>
  );
}
