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
import type { DurationBin, DurationStats } from "@/services/admin/types";
import { cn } from "@/utils/cn";

const MARKERS = [
  { key: "p50", label: "Median", read: (s: DurationStats) => s.median_days },
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
  const hover = useChartHover(bins.length, (index) =>
    setSelected((current) => (current === index ? null : index)),
  );

  const peak = histogramPeak(bins);
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
        <WidgetEmpty>
          Nothing finished in this window with a measurable duration.
        </WidgetEmpty>
      ) : (
        <>
          <ChartFrame
            axis={[dash(peak), dash(Math.round(peak / 2)), "0"]}
            labels={bins.map(binLabel)}
            highlight={active}
            plotClassName="h-32"
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
                      "w-full rounded-t-[3px] transition-all duration-150",
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

            {MARKERS.map((marker) => {
              const offset = percentileOffset(marker.read(stats), bins);

              if (offset === null) return null;

              return (
                <span
                  key={marker.key}
                  className="pointer-events-none absolute inset-y-0"
                  style={{ left: `${offset}%` }}
                >
                  <span className="border-ink/45 absolute inset-y-0 border-l border-dashed" />
                  <span className="text-ink-3 text-micro bg-surface absolute -top-1 left-1 px-1 whitespace-nowrap">
                    {marker.label}
                  </span>
                </span>
              );
            })}

            <div
              {...hover.surface}
              role="slider"
              aria-label="Cycle time bucket"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, bins.length - 1)}
              aria-valuenow={active ?? 0}
              aria-valuetext={
                active === null ? "none" : binLabel(bins[active]!)
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
                title={`${binLabel(bins[hover.index]!)} cycle time`}
                rows={[
                  {
                    key: "count",
                    label: "Tasks",
                    value: dash(bins[hover.index]!.count),
                  },
                  {
                    key: "share",
                    label: "Of completed",
                    value: `${proportionOf(bins[hover.index]!.count, total).toFixed(1)}%`,
                    muted: true,
                  },
                ]}
              />
            )}
          </ChartFrame>

          <p className="text-ink-3 text-mini px-3.5 pb-3">
            {selected === null
              ? (note ?? "Click a bar to focus a segment of the distribution.")
              : `Focused on ${binLabel(bins[selected]!)} — ${bins[selected]!.count} of ${total} completed tasks (${proportionOf(bins[selected]!.count, total).toFixed(1)}%).`}
          </p>
        </>
      )}
    </SummaryCard>
  );
}
