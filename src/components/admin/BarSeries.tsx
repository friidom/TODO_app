import { useTranslation } from "react-i18next";
import { useState } from "react";

import ChartFrame from "@/components/admin/chart/ChartFrame";
import ChartTooltip from "@/components/admin/chart/ChartTooltip";
import { useChartHover } from "@/components/admin/chart/useChartHover";
import Segmented from "@/components/admin/Segmented";
import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import { barHeight, countAxis, seriesPeak } from "@/services/admin/series";
import { bucketLabel, dash } from "@/services/admin/format";
import {
  SERIES_METRIC_DEFINITIONS,
  seriesMetrics,
  type SeriesMetric,
} from "@/services/admin/registry";
import type { Bucket, SeriesPoint } from "@/services/admin/types";
import { cn } from "@/utils/cn";

const LABEL_SLOTS = 12;

export default function BarSeries({
  points,
  bucket,
  title,
  note,
  className,
}: {
  points: SeriesPoint[];
  bucket: Bucket;
  title?: string;
  note?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<SeriesMetric>("completed_todos");
  const hover = useChartHover(points.length);

  const definition = SERIES_METRIC_DEFINITIONS[metric];
  const axis = countAxis(seriesPeak(points, metric));
  const top = axis[0]!;
  const total = points.reduce((sum, point) => sum + point[metric], 0);
  const unestimated = points.reduce(
    (sum, point) => sum + point.unestimated_completed,
    0,
  );

  // Every nth label, so a year of months and a month of days both stay legible
  // without the axis turning into a smear.
  const step = Math.max(1, Math.ceil(points.length / LABEL_SLOTS));
  const hovered = hover.index === null ? null : points[hover.index];

  return (
    <SummaryCard
      title={title ?? t("admin.bars.title")}
      hint={
        definition.countsUnestimated && unestimated > 0
          ? t("admin.bars.hintUnestimated", {
              total: dash(total),
              count: unestimated,
            })
          : t("admin.bars.hint", { total: dash(total) })
      }
      className={className}
      action={
        <Segmented
          size="sm"
          label={t("admin.metric")}
          value={metric}
          options={seriesMetrics().map((option) => ({
            value: option.metric,
            label: option.label,
          }))}
          onChange={setMetric}
        />
      }
    >
      {points.length === 0 ? (
        <WidgetEmpty>{t("summary.trendsEmpty")}</WidgetEmpty>
      ) : total === 0 ? (
        <WidgetEmpty>
          {t("admin.bars.empty", { name: definition.label })}
        </WidgetEmpty>
      ) : (
        <>
          <ChartFrame
            axis={axis.map(dash)}
            labels={points.map((point) => bucketLabel(point.bucket, bucket))}
            labelStep={step}
            highlight={hover.index}
            plotClassName="h-40"
            grid
          >
            {/* Bars, not a line: the buckets are discrete counts, and a line
                would assert values between them that do not exist. */}
            <ol
              className="absolute inset-0 flex items-end"
              aria-label={t("admin.perBucket", {
                name: definition.label,
                values: points
                  .map(
                    (point) =>
                      `${bucketLabel(point.bucket, bucket)} ${point[metric]}`,
                  )
                  .join(", "),
              })}
            >
              {points.map((point, index) => (
                <li
                  key={point.bucket}
                  className={cn(
                    "flex h-full min-w-0 flex-1 items-end justify-center px-px transition-colors",
                    index === hover.index && "bg-ink/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "w-full max-w-3 rounded-t-[3px] transition-[height]",
                      definition.fill,
                    )}
                    style={{ height: barHeight(point[metric], top) }}
                  />
                </li>
              ))}
            </ol>

            <div
              {...hover.surface}
              aria-hidden
              tabIndex={-1}
              className="absolute inset-0"
            />

            {hovered && hover.index !== null && (
              <ChartTooltip
                index={hover.index}
                count={points.length}
                title={bucketLabel(hovered.bucket, bucket)}
                rows={[
                  {
                    key: metric,
                    label: definition.label,
                    value: dash(hovered[metric]),
                  },
                  ...(definition.countsUnestimated &&
                  hovered.unestimated_completed > 0
                    ? [
                        {
                          key: "unestimated",
                          label: t("admin.unestimatedCount", {
                            count: hovered.unestimated_completed,
                          }),
                          value: "",
                          muted: true,
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </ChartFrame>

          {note && <p className="text-ink-3 text-mini px-3.5 pb-3">{note}</p>}
        </>
      )}
    </SummaryCard>
  );
}
