import { useTranslation } from "react-i18next";
import { useMemo } from "react";

import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import {
  heatmapLevel,
  heatmapMax,
  heatmapWeeks,
} from "@/services/admin/series";
import type { HeatmapCell } from "@/services/admin/types";
import { backfillNote } from "@/services/admin/backfill";
import { cn } from "@/utils/cn";

// Five steps of one brand token rather than five hues: the ramp has to read as
// an ordered scale in both themes, and a zero cell carries a border so it is
// distinguishable from a faint one without relying on colour at all.
const LEVELS = [
  "bg-transparent border-hairline border",
  "bg-brand/25",
  "bg-brand/45",
  "bg-brand/70",
  "bg-brand",
];

const WEEKDAYS = [
  "",
  "admin.weekday.mon",
  "",
  "admin.weekday.wed",
  "",
  "admin.weekday.fri",
  "",
];

export default function ContributionHeatmap({
  from,
  to,
  cells,
  className,
}: {
  from: string;
  to: string;
  cells: HeatmapCell[];
  className?: string;
}) {
  const { t } = useTranslation();
  const weeks = useMemo(() => heatmapWeeks(from, to, cells), [from, to, cells]);
  const max = useMemo(() => heatmapMax(cells), [cells]);
  const total = useMemo(
    () => cells.reduce((sum, cell) => sum + cell.count, 0),
    [cells],
  );

  return (
    <SummaryCard
      title={t("admin.heatmap.title")}
      hint={t("admin.heatmap.hint", { count: total })}
      className={className}
    >
      {weeks.length === 0 ? (
        <WidgetEmpty>{t("admin.heatmap.empty")}</WidgetEmpty>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto px-3.5 pb-3.5">
          <div className="text-ink-3/70 text-micro flex shrink-0 flex-col gap-0.75 pt-px">
            {WEEKDAYS.map((day, index) => (
              <span key={index} className="h-2.75 leading-2.75">
                {day && t(day)}
              </span>
            ))}
          </div>

          <div className="flex gap-0.75">
            {weeks.map((week) => (
              <div key={week[0]!.date} className="flex flex-col gap-0.75">
                {week.map((day) => (
                  <span
                    key={day.date}
                    title={`${day.date} — ${day.count} completed`}
                    aria-label={`${day.date}: ${day.count} completed`}
                    className={cn(
                      "size-2.75 shrink-0 rounded-xs",
                      LEVELS[heatmapLevel(day.count, max)],
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {backfillNote(from) && (
        <p className="text-ink-3 text-mini px-3.5 pb-3.5">
          {backfillNote(from)}
        </p>
      )}
    </SummaryCard>
  );
}
