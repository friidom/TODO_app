import { useState } from "react";

import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import { barHeight, seriesPeak } from "@/services/admin/series";
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
  title = "Delivery over time",
  note,
  className,
}: {
  points: SeriesPoint[];
  bucket: Bucket;
  title?: string;
  note?: string;
  className?: string;
}) {
  const [metric, setMetric] = useState<SeriesMetric>("completed_todos");

  const definition = SERIES_METRIC_DEFINITIONS[metric];
  const peak = seriesPeak(points, metric);
  const total = points.reduce((sum, point) => sum + point[metric], 0);
  const unestimated = points.reduce(
    (sum, point) => sum + point.unestimated_completed,
    0,
  );

  // Every nth label, so a year of months and a month of days both stay legible
  // without the axis turning into a smear.
  const step = Math.max(1, Math.ceil(points.length / LABEL_SLOTS));

  return (
    <SummaryCard
      title={title}
      hint={
        definition.countsUnestimated && unestimated > 0
          ? `${dash(total)} in this period · ${unestimated} completed with no estimate`
          : `${dash(total)} in this period`
      }
      className={className}
      action={
        <div role="group" aria-label="Metric" className="flex flex-wrap gap-1">
          {seriesMetrics().map((option) => (
            <button
              key={option.metric}
              type="button"
              onClick={() => setMetric(option.metric)}
              aria-pressed={option.metric === metric}
              className={cn(
                "text-ink-3 hover:text-ink text-mini rounded px-1.5 py-0.5 transition-colors",
                option.metric === metric && `bg-wash ${option.tone}`,
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {points.length === 0 ? (
        <WidgetEmpty>Nothing to chart yet.</WidgetEmpty>
      ) : (
        <div className="flex gap-2.5 px-3.5 pb-3">
          <div className="text-ink-3/70 text-micro flex w-7 shrink-0 flex-col justify-between py-px text-right tabular-nums">
            <span>{dash(peak)}</span>
            <span>{dash(Math.round((peak / 2) * 10) / 10)}</span>
            <span>0</span>
          </div>

          <div className="min-w-0 flex-1">
            {/* Bars, not a line: the buckets are discrete counts, and a line
                would assert values between them that do not exist. */}
            <ol
              className="flex h-28 items-end gap-px"
              aria-label={`${definition.label} per bucket: ${points
                .map(
                  (point) =>
                    `${bucketLabel(point.bucket, bucket)} ${point[metric]}`,
                )
                .join(", ")}`}
            >
              {points.map((point) => (
                <li
                  key={point.bucket}
                  className="flex h-full min-w-0 flex-1 items-end"
                  title={`${bucketLabel(point.bucket, bucket)} — ${point[metric]}`}
                >
                  <span
                    className={cn(
                      "w-full rounded-t-xs transition-[height]",
                      definition.fill,
                    )}
                    style={{ height: barHeight(point[metric], peak) }}
                  />
                </li>
              ))}
            </ol>

            <div className="mt-1.5 flex gap-px">
              {points.map((point, index) => (
                <span
                  key={point.bucket}
                  className="text-ink-3/70 text-micro min-w-0 flex-1 truncate text-center"
                >
                  {index % step === 0 ? bucketLabel(point.bucket, bucket) : ""}
                </span>
              ))}
            </div>

            {note && <p className="text-ink-3 text-mini mt-2">{note}</p>}
          </div>
        </div>
      )}
    </SummaryCard>
  );
}
