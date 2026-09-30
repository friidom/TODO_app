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
    <div className="flex flex-col gap-3">
      {/* Five that answer "what happened in this period", then three that
          answer "how big is the system" -- which do not change with the
          period and do not belong in the same row. Eight tiles in one
          five-column grid left a hole at every width. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Tile
          label={t("admin.metrics.completedTasks")}
          value={totals.completed_todos}
        />

        <Tile
          label={t("admin.metrics.completedPoints")}
          value={totals.completed_points}
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

        <Tile label={t("admin.tasksCreated")} value={totals.created_todos} />
        <Tile label={t("taskActivity.comments")} value={totals.comments} />
        <Tile
          label={t("admin.metrics.activityEvents")}
          value={totals.activities}
        />
      </div>

      <dl className="border-hairline bg-surface rounded-card flex flex-wrap items-center gap-x-8 gap-y-2 border px-3.5 py-2.5">
        <Standing label={t("admin.openTasks")} value={totals.open_todos} />
        <Standing label={t("admin.sections.users")} value={totals.users} />
        <Standing label={t("boards.title")} value={totals.boards} />

        {cycle && (
          <>
            <Standing
              label={t("admin.medianCycle")}
              text={formatDuration(cycle.median_days)}
            />
            <Standing
              label={t("admin.p75Cycle")}
              text={formatDuration(cycle.p75_days)}
            />
          </>
        )}
      </dl>
    </div>
  );
}

function Tile({
  label,
  value,
  aside,
}: {
  label: string;
  value: number;
  aside?: string;
}) {
  return (
    <div className="border-hairline bg-surface rounded-card flex min-w-0 flex-col border px-3.5 py-2.5">
      <span className="text-ink-3 text-micro truncate font-semibold tracking-wide uppercase">
        {label}
      </span>

      <span className="text-ink truncate text-xl font-semibold tabular-nums">
        {dash(value)}
      </span>

      {/* Reserved whether or not it is filled, so one tile carrying an
          unestimated count does not make its row taller than the others. */}
      <span
        className={cn(
          "text-ink-3 text-mini h-4 truncate",
          aside === undefined && "invisible",
        )}
      >
        {aside ?? "—"}
      </span>
    </div>
  );
}

function Standing({
  label,
  value,
  text,
}: {
  label: string;
  value?: number;
  text?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-3 text-mini">{label}</dt>
      <dd className="text-ink-2 text-meta font-semibold tabular-nums">
        {text ?? dash(value)}
      </dd>
    </div>
  );
}
