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
  const rows = [
    { key: "cycle", label: "Cycle", hint: "Started to done", stats: cycle },
    { key: "lead", label: "Lead", hint: "Created to done", stats: lead },
  ];

  const anything = hasDurations(cycle) || hasDurations(lead);

  return (
    <SummaryCard
      title="Flow time"
      hint="How long work takes, and how much of it we can say that about"
      className={className}
    >
      {!anything ? (
        <WidgetEmpty>
          Nothing finished in this window with a measurable duration.
        </WidgetEmpty>
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
                <Figure label="median" value={row.stats.median_days} lead />
                <Figure label="p75" value={row.stats.p75_days} />
                <Figure label="p90" value={row.stats.p90_days} />
              </dl>

              <p className="text-ink-3 text-micro mt-1 tabular-nums">
                {row.stats.n} measured
                {row.stats.unmeasured > 0 &&
                  ` · ${row.stats.unmeasured} without a start date`}
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
