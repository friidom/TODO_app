import { useTranslation } from "react-i18next";
import { dash, formatDuration } from "@/services/admin/format";
import type { DurationStats, SystemTotals } from "@/services/admin/types";
import { cn } from "@/utils/cn";

export default function StatTiles({
  totals,
  cycle,
}: {
  totals: SystemTotals;
  cycle?: DurationStats;
}) {
  const { t } = useTranslation();

  return (
    <section className="border-hairline bg-surface rounded-card overflow-hidden border">
      {/* Every figure up here is about the selected period; the row beneath is
          the system as it stands, which no period changes. Median cycle is a
          period figure too, so it sits with them rather than with the
          totals. The 1px gap over a hairline draws the dividers. */}
      <dl className="bg-hairline grid grid-cols-2 gap-px sm:grid-cols-5">
        <Figure
          label={t("admin.metrics.completedTasks")}
          value={dash(totals.completed_todos)}
        />

        <Figure
          label={t("admin.metrics.completedPoints")}
          value={dash(totals.completed_points)}
          // D-7: a points figure never travels without the count of work
          // nobody sized, or it reads as the whole of what was finished.
          aside={
            totals.unestimated_completed > 0
              ? t("admin.unestimatedCount", {
                  count: totals.unestimated_completed,
                })
              : undefined
          }
        />

        <Figure
          label={t("admin.tasksCreated")}
          value={dash(totals.created_todos)}
        />

        <Figure
          label={t("admin.medianCycle")}
          value={cycle ? formatDuration(cycle.median_days) : "—"}
          aside={
            cycle && cycle.p75_days !== null
              ? `${t("admin.p75Cycle")} ${formatDuration(cycle.p75_days)}`
              : undefined
          }
        />

        <Figure
          label={t("taskActivity.comments")}
          value={dash(totals.comments)}
        />
      </dl>

      <div className="border-hairline flex flex-wrap items-baseline gap-x-6 gap-y-1.5 border-t px-4 py-2.5">
        <p className="text-ink-3 text-micro font-medium">
          {t("admin.rightNow")}
        </p>
        <dl className="contents">
          <Standing label={t("admin.openTasks")} value={totals.open_todos} />
          <Standing label={t("admin.sections.users")} value={totals.users} />
          <Standing label={t("boards.title")} value={totals.boards} />
        </dl>
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  aside,
}: {
  label: string;
  value: string;
  aside?: string;
}) {
  return (
    <div className="bg-surface flex min-w-0 flex-col px-4 pt-3.5 pb-3 last:col-span-2 sm:last:col-span-1">
      <dt className="text-ink-3 text-mini order-2 mt-1 truncate">{label}</dt>

      <dd className="text-ink order-1 truncate text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </dd>

      {/* Reserved whether or not it is filled, so one figure carrying an
          aside does not make its row taller than the others. */}
      <span
        className={cn(
          "text-ink-3/80 text-micro order-3 h-3.5 truncate",
          aside === undefined && "invisible",
        )}
      >
        {aside ?? "—"}
      </span>
    </div>
  );
}

function Standing({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-3 text-mini">{label}</dt>
      <dd className="text-ink-2 text-meta font-medium tabular-nums">
        {dash(value)}
      </dd>
    </div>
  );
}
