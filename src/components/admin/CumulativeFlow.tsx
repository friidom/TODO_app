import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import ChartFrame from "@/components/admin/chart/ChartFrame";
import ChartLegend from "@/components/admin/chart/ChartLegend";
import ChartTooltip from "@/components/admin/chart/ChartTooltip";
import Crosshair from "@/components/admin/chart/Crosshair";
import { useChartHover } from "@/components/admin/chart/useChartHover";
import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import {
  bandValueAt,
  bucketRange,
  CFD_BANDS,
  cfdBands,
  cfdPeak,
  cfdTotalAt,
  smoothAreaPath,
  smoothLinePath,
  type CfdBandKey,
} from "@/services/admin/flow";
import { bucketLabel, dash } from "@/services/admin/format";
import type { Bucket, CfdPoint } from "@/services/admin/types";

const PLOT_HEIGHT = 40;
const HEADROOM = 3;
const GRID = [0, 0.25, 0.5, 0.75, 1];
const LABEL_SLOTS = 10;
const FILL = [0.55, 0.38, 0.16];

export default function CumulativeFlow({
  points,
  bucket,
  windowTo,
  scopeQuery = "",
  note,
  className,
}: {
  points: CfdPoint[];
  bucket: Bucket;
  windowTo: string;
  scopeQuery?: string;
  note?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState<ReadonlySet<CfdBandKey>>(new Set());

  const drill = (index: number) => {
    const range = bucketRange(
      points.map((point) => point.bucket),
      index,
      windowTo,
    );

    if (range === null) return;

    void navigate(
      `/admin/activity?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}${scopeQuery}`,
    );
  };

  const hover = useChartHover(points.length, drill);

  const peak = cfdPeak(points, hidden);
  const scale = { height: PLOT_HEIGHT, headroom: HEADROOM, peak };
  const bands = useMemo(() => cfdBands(points, hidden), [points, hidden]);

  const step = Math.max(1, Math.ceil(points.length / LABEL_SLOTS));
  const labels = points.map((point) => bucketLabel(point.bucket, bucket));
  const empty = points.length === 0 || peak <= 1;

  const toggle = (key: string) =>
    setHidden((current) => {
      const next = new Set(current);

      if (next.has(key as CfdBandKey)) next.delete(key as CfdBandKey);
      else next.add(key as CfdBandKey);

      return next.size === CFD_BANDS.length ? current : next;
    });

  return (
    <SummaryCard
      title="Cumulative flow"
      hint="Every countable card by the stage it had reached, at the end of each bucket"
      className={className}
      action={
        <ChartLegend
          items={[...CFD_BANDS].reverse().map((band) => ({
            key: band.key,
            label: band.label,
            tone: band.fill,
          }))}
          hidden={hidden}
          onToggle={toggle}
        />
      }
    >
      {empty ? (
        <WidgetEmpty>Nothing has flowed through this window yet.</WidgetEmpty>
      ) : (
        <>
          <ChartFrame
            axis={[dash(peak), dash(Math.round(peak / 2)), "0"]}
            labels={labels}
            labelStep={step}
            highlight={hover.index}
          >
            <svg
              viewBox={`0 0 100 ${PLOT_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Cumulative flow across ${points.length} buckets, ${dash(peak)} items at its peak`}
              className="h-full w-full overflow-visible"
            >
              {GRID.map((share) => (
                <line
                  key={share}
                  x1="0"
                  x2="100"
                  y1={PLOT_HEIGHT - share * (PLOT_HEIGHT - HEADROOM)}
                  y2={PLOT_HEIGHT - share * (PLOT_HEIGHT - HEADROOM)}
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeDasharray={share === 0 ? undefined : "2 3"}
                  vectorEffect="non-scaling-stroke"
                  className={share === 0 ? "text-ink/15" : "text-ink/[0.06]"}
                />
              ))}

              {bands.map((band, order) => {
                const tone = CFD_BANDS.find(
                  (entry) => entry.key === band.key,
                )!.fill;

                return (
                  <g key={band.key} className={tone}>
                    <path
                      d={smoothAreaPath(band, scale)}
                      fill="currentColor"
                      fillOpacity={FILL[order] ?? 0.2}
                    />
                    <path
                      d={smoothLinePath(band.upper, scale)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}

              {hover.index !== null && (
                <Crosshair
                  index={hover.index}
                  count={points.length}
                  height={PLOT_HEIGHT}
                />
              )}
            </svg>

            <div
              {...hover.surface}
              role="slider"
              aria-label="Flow bucket"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, points.length - 1)}
              aria-valuenow={hover.index ?? 0}
              aria-valuetext={
                hover.index === null
                  ? "none"
                  : bucketLabel(points[hover.index]!.bucket, bucket)
              }
              onClick={() => hover.index !== null && drill(hover.index)}
              className="focus-visible:ring-brand/40 absolute inset-0 cursor-pointer rounded outline-none focus-visible:ring-2"
            />

            {hover.index !== null && (
              <ChartTooltip
                index={hover.index}
                count={points.length}
                title={bucketLabel(points[hover.index]!.bucket, bucket)}
                rows={[...bands].reverse().map((band) => ({
                  key: band.key,
                  label: band.label,
                  value: dash(bandValueAt(band, hover.index!)),
                  tone: CFD_BANDS.find((entry) => entry.key === band.key)!.fill,
                }))}
                footer={{
                  label: "Total",
                  value: dash(cfdTotalAt(points, hover.index)),
                }}
              />
            )}
          </ChartFrame>

          <p className="text-ink-3 text-mini px-3.5 pb-3">
            {note ? `${note} ` : ""}Click a point to open the activity for that
            range.
          </p>
        </>
      )}
    </SummaryCard>
  );
}
