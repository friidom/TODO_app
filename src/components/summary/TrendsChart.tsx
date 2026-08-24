import { trendPeak, type TrendPoint } from "@/services/views/trends";
import SummaryCard, { WidgetEmpty } from "./SummaryCard";

/**
 * The board's last week, as two lines (M18 polish).
 *
 * **Hand-rolled SVG, like the status donut, and for the same reason.** One chart
 * does not justify a charting dependency: recharts is ~90kB gzipped and brings
 * its own theming, fonts and animation opinions to a product that has all three
 * already. This is two paths per series and a few rules.
 *
 * **Two series, not three.** Completed-per-day is not derivable from this
 * schema and is not faked here — `services/views/trends.ts` records exactly why,
 * and what would make it possible. The `updated` series carries its own caveat,
 * stated in the panel's own subtitle rather than buried in a comment: it counts
 * items whose *latest* change fell on a day, because `updated_at` is the only
 * edit timestamp a row keeps.
 *
 * **Points sit at the centre of their day's slot**, at `(i + 0.5) × step`,
 * rather than at `i / (n - 1)`. A day is an interval, not an instant, and
 * centring is what lets the axis labels below line up under the vertices without
 * the first and last being half off the edge.
 *
 * **A fixed `viewBox` with `preserveAspectRatio="none"`**, so the chart stretches
 * to whatever width the panel has without recomputing anything on resize — the
 * points are laid out in an abstract 100×40 space and the browser scales it.
 * `vector-effect="non-scaling-stroke"` is what stops that stretch from making
 * the strokes thick and uneven, and it is on the grid rules too.
 */

/** Plot-space height. Width is 100, so both are percentages in disguise. */
const PLOT_HEIGHT = 40;

/** Headroom at the top, so a peak day's vertex is not clipped by the viewBox. */
const HEADROOM = 3;

/** Where the grid rules sit, as a share of the peak. */
const GRID_LINES = [0, 0.5, 1];

const SERIES = [
  {
    key: "created",
    label: "Created",
    // The brand accent on the series that means "new work", which is the one
    // the panel is mostly read for.
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
  /** The widget's span in the Summary's grid. */
  className?: string;
}) {
  const peak = trendPeak(points);
  const step = points.length === 0 ? 0 : 100 / points.length;

  /** Plot-space x for the centre of day `i`. */
  const xOf = (i: number) => (i + 0.5) * step;

  /** Plot-space y for a count, with the top of the box reserved as headroom. */
  const yOf = (count: number) =>
    PLOT_HEIGHT - (count / peak) * (PLOT_HEIGHT - HEADROOM);

  return (
    <SummaryCard
      title="Activity trends"
      // The caveat lives here rather than only in a code comment: `updated_at`
      // holds the most recent change and nothing before it, so this is what the
      // blue line actually counts. Saying it on the panel is the difference
      // between a chart and a chart you can trust.
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
          {/* The y axis, as HTML rather than SVG `<text>`: it inherits the
              page's font and needs no transform to stay upright inside a
              stretched viewBox. Three readings — peak, half, zero — because a
              tick per unit is a ladder nobody climbs. */}
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
              // 112px of plot: tall enough that a seven-point line has shape,
              // short enough that the chart is a tier of the dashboard rather
              // than a screen of its own.
              className="h-28 w-full"
            >
              <defs>
                {/* `currentColor` in a stop resolves against the gradient
                    element's own inherited colour, not the shape referencing
                    it — so the class goes here, and the fill can never drift
                    from the line it sits under. */}
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
                    {/* Closed down to the floor at the first and last vertex,
                        so the fill sits under the line rather than under the
                        whole box. */}
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

            {/* One cell per day, centred — the same slots the vertices sit in. */}
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

/**
 * `2026-08-14` → `14 Aug`.
 *
 * Built through `Date.UTC` and read back in UTC, so the formatter cannot shift
 * the label onto a neighbouring day — the string is already a local calendar day
 * by the time it reaches here, and re-parsing it as an instant is exactly how a
 * date drifts.
 */
function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(
    undefined,
    { day: "numeric", month: "short", timeZone: "UTC" },
  );
}
