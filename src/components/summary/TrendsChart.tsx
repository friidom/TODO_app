import { trendPeak, type TrendPoint } from "@/services/views/trends";
import SummaryCard, { WidgetEmpty } from "./SummaryCard";

// hand-rolled SVG rather than a charting lib — one chart doesn't justify a ~90kB dependency
const PLOT_HEIGHT = 40;
const HEADROOM = 3;
const GRID_LINES = [0, 0.5, 1];

const SERIES = [
  {
    key: "created",
    label: "Created",
    tone: "text-brand",
    dot: "bg-brand",
    fill: "url(#summary-trend-created)",
  },
  {
    key: "updated",
    label: "Updated",
    tone: "text-status-blue",
    dot: "bg-status-blue",
    fill: "url(#summary-trend-updated)",
  },
] as const;

export default function TrendsChart({
  points,
  className,
}: {
  points: TrendPoint[];
  className?: string;
}) {
  const peak = trendPeak(points);
  const step = points.length === 0 ? 0 : 100 / points.length;

  // centered in the day's slot, not at i/(n-1), so a day (an interval) lines up under its axis label
  const xOf = (i: number) => (i + 0.5) * step;

  const yOf = (count: number) =>
    PLOT_HEIGHT - (count / peak) * (PLOT_HEIGHT - HEADROOM);

  return (
    <SummaryCard
      title="Activity trends"
      hint="Items created, and items whose most recent change fell on that day"
      className={className}
      action={
        <div className="flex items-center gap-3">
          {SERIES.map((series) => (
            <span
              key={series.key}
              className="text-ink-3 text-mini flex items-center gap-1.5"
            >
              <span className={`size-1.5 rounded-full ${series.dot}`} />
              {series.label}
            </span>
          ))}
        </div>
      }
    >
      {points.length === 0 ? (
        <WidgetEmpty>Nothing to chart yet.</WidgetEmpty>
      ) : (
        <div className="flex gap-2.5 px-3.5 pb-3">
          {/* HTML, not SVG text — inherits the page font and stays upright inside the stretched viewBox */}
          <div className="text-ink-3/70 text-micro flex w-6 shrink-0 flex-col justify-between py-px text-right tabular-nums">
            <span>{peak}</span>
            <span>{Math.round(peak / 2)}</span>
            <span>0</span>
          </div>

          <div className="min-w-0 flex-1">
            <svg
              viewBox={`0 0 100 ${PLOT_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={SERIES.map(
                (series) =>
                  `${series.label} per day: ${points
                    .map((point) => point[series.key])
                    .join(", ")}`,
              ).join(". ")}
              className="h-28 w-full"
            >
              <defs>
                {/* the tone class lives on the gradient itself — currentColor in a stop resolves against its own inherited color */}
                <linearGradient
                  id="summary-trend-created"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                  className="text-brand"
                >
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity="0.22"
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity="0"
                  />
                </linearGradient>

                <linearGradient
                  id="summary-trend-updated"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                  className="text-status-blue"
                >
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity="0.16"
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>

              {GRID_LINES.map((share) => (
                <line
                  key={share}
                  x1="0"
                  x2="100"
                  y1={yOf(peak * share)}
                  y2={yOf(peak * share)}
                  stroke="currentColor"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  className="text-ink/[0.07]"
                />
              ))}

              {SERIES.map((series) => {
                const coords = points.map(
                  (point, i) =>
                    `${xOf(i).toFixed(2)},${yOf(point[series.key]).toFixed(2)}`,
                );

                const line = `M ${coords.join(" L ")}`;

                return (
                  <g key={series.key} className={series.tone}>
                    {/* closed to the floor at both ends so the fill sits under the line, not the whole box */}
                    <path
                      d={`${line} L ${xOf(points.length - 1).toFixed(2)},${PLOT_HEIGHT} L ${xOf(0).toFixed(2)},${PLOT_HEIGHT} Z`}
                      fill={series.fill}
                    />

                    <path
                      d={line}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
            </svg>

            <div className="mt-1.5 flex">
              {points.map((point) => (
                <span
                  key={point.day}
                  className="text-ink-3/70 text-micro min-w-0 flex-1 truncate text-center"
                >
                  {dayLabel(point.day)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </SummaryCard>
  );
}

// Date.UTC in, UTC out — otherwise the formatter can shift the label onto a neighboring day
function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(
    undefined,
    { day: "numeric", month: "short", timeZone: "UTC" },
  );
}
