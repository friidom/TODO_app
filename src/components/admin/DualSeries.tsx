import { useState } from "react";

import ChartFrame from "@/components/admin/chart/ChartFrame";
import ChartLegend from "@/components/admin/chart/ChartLegend";
import ChartTooltip from "@/components/admin/chart/ChartTooltip";
import Crosshair from "@/components/admin/chart/Crosshair";
import { useChartHover } from "@/components/admin/chart/useChartHover";
import SummaryCard, { WidgetEmpty } from "@/components/summary/SummaryCard";
import { smoothLinePath, xOf, yOf } from "@/services/admin/flow";
import { bucketLabel, dash } from "@/services/admin/format";
import type { Bucket, SeriesPoint } from "@/services/admin/types";

const PLOT_HEIGHT = 40;
const HEADROOM = 3;
const GRID = [0, 0.5, 1];
const LABEL_SLOTS = 10;

const SERIES = [
  { key: "created_todos", label: "Created", tone: "text-status-orange" },
  { key: "completed_todos", label: "Completed", tone: "text-status-green" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

export default function DualSeries({
  points,
  bucket,
  className,
}: {
  points: SeriesPoint[];
  bucket: Bucket;
  className?: string;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const hover = useChartHover(points.length);

  const visible = SERIES.filter((series) => !hidden.has(series.key));

  const peak = Math.max(
    1,
    ...points.flatMap((point) => visible.map((series) => point[series.key])),
  );

  const scale = { height: PLOT_HEIGHT, headroom: HEADROOM, peak };
  const step = Math.max(1, Math.ceil(points.length / LABEL_SLOTS));
  const totals = (key: SeriesKey) =>
    points.reduce((sum, point) => sum + point[key], 0);

  const toggle = (key: string) =>
    setHidden((current) => {
      const next = new Set(current);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next.size === SERIES.length ? current : next;
    });

  const net =
    hover.index === null
      ? 0
      : points[hover.index]!.created_todos -
        points[hover.index]!.completed_todos;

  return (
    <SummaryCard
      title="Created vs completed"
      hint={`${dash(totals("created_todos"))} in, ${dash(totals("completed_todos"))} out over this window`}
      className={className}
      action={
        <ChartLegend
          items={SERIES.map((series) => ({ ...series }))}
          hidden={hidden}
          onToggle={toggle}
        />
      }
    >
      {points.length === 0 ? (
        <WidgetEmpty>
          Nothing was created or completed in this window.
        </WidgetEmpty>
      ) : (
        <ChartFrame
          axis={[dash(peak), dash(Math.round(peak / 2)), "0"]}
          labels={points.map((point) => bucketLabel(point.bucket, bucket))}
          labelStep={step}
          highlight={hover.index}
        >
          <svg
            viewBox={`0 0 100 ${PLOT_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={visible
              .map(
                (series) =>
                  `${series.label}: ${points.map((p) => p[series.key]).join(", ")}`,
              )
              .join(". ")}
            className="h-full w-full overflow-visible"
          >
            <defs>
              {SERIES.map((series) => (
                <linearGradient
                  key={series.key}
                  id={`dual-${series.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                  className={series.tone}
                >
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity="0.2"
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity="0"
                  />
                </linearGradient>
              ))}
            </defs>

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

            {visible.map((series) => {
              const values = points.map((point) => point[series.key]);
              const line = smoothLinePath(values, scale);
              const last = xOf(points.length - 1, points.length).toFixed(2);
              const first = xOf(0, points.length).toFixed(2);

              return (
                <g key={series.key} className={series.tone}>
                  <path
                    d={`${line} L ${last},${PLOT_HEIGHT} L ${first},${PLOT_HEIGHT} Z`}
                    fill={`url(#dual-${series.key})`}
                  />
                  <path
                    d={line}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}

            {hover.index !== null && (
              <>
                <Crosshair
                  index={hover.index}
                  count={points.length}
                  height={PLOT_HEIGHT}
                />
                {visible.map((series) => (
                  <circle
                    key={series.key}
                    cx={xOf(hover.index!, points.length)}
                    cy={yOf(points[hover.index!]![series.key], scale)}
                    r="2.5"
                    fill="currentColor"
                    className={series.tone}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </>
            )}
          </svg>

          <div
            {...hover.surface}
            role="slider"
            aria-label="Bucket"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, points.length - 1)}
            aria-valuenow={hover.index ?? 0}
            aria-valuetext={
              hover.index === null
                ? "none"
                : bucketLabel(points[hover.index]!.bucket, bucket)
            }
            className="focus-visible:ring-brand/40 absolute inset-0 rounded outline-none focus-visible:ring-2"
          />

          {hover.index !== null && (
            <ChartTooltip
              index={hover.index}
              count={points.length}
              title={bucketLabel(points[hover.index]!.bucket, bucket)}
              rows={SERIES.map((series) => ({
                key: series.key,
                label: series.label,
                value: hidden.has(series.key)
                  ? "—"
                  : dash(points[hover.index!]![series.key]),
                tone: series.tone,
                muted: hidden.has(series.key),
              }))}
              footer={{
                label: "Net change",
                value: `${net > 0 ? "+" : ""}${net}`,
              }}
            />
          )}
        </ChartFrame>
      )}
    </SummaryCard>
  );
}
