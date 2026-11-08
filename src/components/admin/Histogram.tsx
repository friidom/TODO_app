import { useTranslation } from "react-i18next";
import i18n from "@/components/i18n";
import { useState } from "react";

import ChartFrame from "@/components/admin/chart/ChartFrame";
import ChartTooltip from "@/components/admin/chart/ChartTooltip";
import { useChartHover } from "@/components/admin/chart/useChartHover";
import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import {
  histogramPeak,
  percentileOffset,
  proportionOf,
} from "@/services/admin/flow";
import { binLabel, dash, formatDuration } from "@/services/admin/format";
import { countAxis } from "@/services/admin/series";
import type { DurationBin, DurationStats } from "@/services/admin/types";
import { cn } from "@/utils/cn";

const MARKERS = [
  {
    key: "p50",
    get label() {
      return i18n.t("admin.median");
    },
    read: (s: DurationStats) => s.median_days,
  },
  { key: "p75", label: "P75", read: (s: DurationStats) => s.p75_days },
  { key: "p90", label: "P90", read: (s: DurationStats) => s.p90_days },
] as const;

export default function Histogram({
  title,
  hint,
  bins,
  stats,
  note,
  className,
}: {
  title: string;
  hint?: string;
  bins: DurationBin[];
  stats: DurationStats;
  note?: string;
  className?: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const { t } = useTranslation();
  const hover = useChartHover(bins.length, (index) =>
    setSelected((current) => (current === index ? null : index)),
  );

  const axis = countAxis(histogramPeak(bins));
  const peak = axis[0]!;
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  const active = hover.index ?? selected;

  return (
    <SummaryCard
      title={title}
      hint={hint}
      className={className}
      action={
        <dl className="flex items-baseline gap-4">
          {MARKERS.map((marker) => (
            <div key={marker.key} className="text-right">
              <dd className="text-ink text-sm leading-tight font-semibold tabular-nums">
                {formatDuration(marker.read(stats))}
              </dd>
              <dt className="text-ink-3 text-micro">{marker.label}</dt>
            </div>
          ))}
        </dl>
      }
    >
      {bins.length === 0 || total === 0 ? (
        <WidgetEmpty>{t("admin.noDurations")}</WidgetEmpty>
      ) : (
        <>
          <ChartFrame
            axis={axis.map(dash)}
            labels={bins.map(binLabel)}
            highlight={active}
            plotClassName="h-32"
            grid
          >
            <div className="absolute inset-0 flex items-end gap-1">
              {bins.map((bin, index) => (
                <span
                  key={bin.from_days}
                  className="flex h-full min-w-0 flex-1 items-end"
                >
                  <span
                    style={{
                      height: `${Math.max(bin.count === 0 ? 0 : 3, (bin.count / peak) * 100)}%`,
                    }}
                    className={cn(
                      "w-full rounded-t-[3px] transition-[height,background-color] duration-150",
                      selected === index
                        ? "bg-brand"
                        : active === index
                          ? "bg-brand/85"
                          : selected === null
                            ? "bg-brand/55"
                            : "bg-brand/25",
                    )}
                  />
                </span>
              ))}
            </div>

            {markerRows(
              MARKERS.map((marker) =>
                percentileOffset(marker.read(stats), bins),
              ),
            ).map((row, index) => {
              const marker = MARKERS[index]!;

              if (row === null) return null;

              return (
                <span
                  key={marker.key}
                  className="pointer-events-none absolute inset-y-0"
                  style={{ left: `${row.offset}%` }}
                >
                  <span className="border-ink/45 absolute inset-y-0 border-l border-dashed" />
                  <span
                    className="text-ink-3 text-micro bg-surface absolute left-1 px-1 leading-4 whitespace-nowrap"
                    style={{ top: `${row.line * 16 - 4}px` }}
                  >
                    {marker.label}
                  </span>
                </span>
              );
            })}

            <div
              {...hover.surface}
              role="slider"
              aria-label={t("admin.histogram.bucket")}
              aria-valuemin={0}
              aria-valuemax={Math.max(0, bins.length - 1)}
              aria-valuenow={active ?? 0}
              aria-valuetext={
                active === null ? t("common.none") : binLabel(bins[active]!)
              }
              onClick={() =>
                hover.index !== null &&
                setSelected((current) =>
                  current === hover.index ? null : hover.index,
                )
              }
              className="focus-visible:ring-brand/40 absolute inset-0 cursor-pointer rounded outline-none focus-visible:ring-2"
            />

            {hover.index !== null && (
              <ChartTooltip
                index={hover.index}
                count={bins.length}
                title={t("admin.histogram.tooltip", {
                  bin: binLabel(bins[hover.index]!),
                })}
                rows={[
                  {
                    key: "count",
                    label: t("admin.columns.tasks"),
                    value: dash(bins[hover.index]!.count),
                  },
                  {
                    key: "share",
                    label: t("admin.histogram.ofCompleted"),
                    value: `${proportionOf(bins[hover.index]!.count, total).toFixed(1)}%`,
                    muted: true,
                  },
                ]}
              />
            )}
          </ChartFrame>

          <p className="text-ink-3 text-mini px-3.5 pb-3">
            {selected === null
              ? (note ?? t("admin.histogram.clickBar"))
              : t("admin.histogram.focused", {
                  bin: binLabel(bins[selected]!),
                  count: bins[selected]!.count,
                  total,
                  percent: proportionOf(bins[selected]!.count, total).toFixed(
                    1,
                  ),
                })}
          </p>
        </>
      )}
    </SummaryCard>
  );
}

// Close percentiles share a bucket, and their labels landed on top of each
// other; a label within reach of the previous one drops a line.
function markerRows(
  offsets: (number | null)[],
): ({ offset: number; line: number } | null)[] {
  let previous: { offset: number; line: number } | null = null;

  return offsets.map((offset) => {
    if (offset === null) return null;

    const line =
      previous !== null && offset - previous.offset < 9 ? previous.line + 1 : 0;

    previous = { offset, line };

    return previous;
  });
}
