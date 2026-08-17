import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import type { TrendPoint } from "@/services/views/summary";
import SummaryCard from "./SummaryCard";

/**
 * How fast work is arriving on this board (M18 polish).
 *
 * **It charts creations, not completions, and that is a data decision recorded
 * where the data is** — see `createdTrend` in `services/views/summary.ts`.
 * Doneness on this board is derived from the column a card sits in, so no row
 * carries the instant it was completed; the only honest series available from
 * the cache is `created_at`. The alternative was a completion line inferred
 * from `updated_at`, which would be a plausible chart made of guesses.
 *
 * **Hand-rolled SVG, like the status donut.** Two paths and a baseline is not
 * worth a charting dependency, and adding one would put a second visual
 * language on a page whose whole point is that it looks like the product.
 *
 * The area is a `linearGradient` from the brand accent down to nothing — the
 * one gradient on the page, and it is doing real work: it separates the filled
 * region from the surface without needing a border or a second colour.
 */
export default function Intake({
  points,
  previous,
}: {
  points: TrendPoint[];
  /** The same count over the preceding window, or null if the board is younger. */
  previous: number | null;
}) {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const peak = Math.max(1, ...points.map((point) => point.count));
  const days = points.length;

  const delta = previous === null ? null : total - previous;

  return (
    <SummaryCard
      title="Intake"
      hint={`Work items created in the last ${days} days.`}
      action={
        delta !== null && delta !== 0 ? (
          // Neither direction is good or bad — a busy fortnight is not a
          // failure — so this is the quietest possible signal: a glyph and a
          // number, in the ink palette rather than the semantic one.
          <span className="text-ink-3 flex items-center gap-1 text-[11px] font-medium tabular-nums">
            {delta > 0 ? (
              <TrendingUpIcon className="size-3.5" />
            ) : (
              <TrendingDownIcon className="size-3.5" />
            )}
            {delta > 0 ? `+${delta}` : delta}
            <span className="text-ink-3/70">vs previous</span>
          </span>
        ) : undefined
      }
    >
      <div className="px-4 pb-4">
        <p className="text-ink text-2xl leading-none font-semibold tabular-nums">
          {total}
        </p>

        <p className="text-ink-3 mt-1 text-[11px]">
          {total === 1 ? "item created" : "items created"}
          {peak > 1 && <> · busiest day {peak}</>}
        </p>

        <Sparkline points={points} peak={peak} />

        {/* The two ends of the axis, and nothing between them. A tick per day
            over a fortnight is fourteen labels nobody reads; the shape is the
            information and the endpoints are what anchor it. */}
        <div className="text-ink-3/70 mt-1.5 flex justify-between text-[10px] tabular-nums">
          <span>{label(points[0]?.day)}</span>
          <span>Today</span>
        </div>
      </div>
    </SummaryCard>
  );
}

/** `2026-08-04` → `4 Aug`. Local days already, so this is pure formatting. */
function label(day: string | undefined): string {
  if (!day) return "";

  const [year, month, date] = day.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(
    undefined,
    { day: "numeric", month: "short", timeZone: "UTC" },
  );
}

/**
 * The series, as an area under a line.
 *
 * A fixed `viewBox` with `preserveAspectRatio="none"`, so the chart stretches to
 * whatever width the card has without recomputing anything on resize — the
 * points are laid out in an abstract 100×32 space and the browser scales it.
 * `vector-effect: non-scaling-stroke` is what stops that stretch from making the
 * stroke thick and uneven.
 *
 * A single day would be a dot rather than a line, so it draws a flat segment
 * instead of a path with one point in it.
 */
function Sparkline({ points, peak }: { points: TrendPoint[]; peak: number }) {
  if (points.length === 0) return null;

  const step = points.length > 1 ? 100 / (points.length - 1) : 0;

  const coords = points.map((point, i) => {
    const x = points.length > 1 ? i * step : 50;
    // 2px of headroom at the top so a peak day's vertex is not clipped by the
    // viewBox edge.
    const y = 30 - (point.count / peak) * 28;

    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M ${coords.join(" L ")}`;
  const area = `${line} L 100,32 L 0,32 Z`;

  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Created per day: ${points.map((p) => p.count).join(", ")}`}
      // `text-brand` on the root, so both the stroke and the gradient stops
      // resolve `currentColor` to the one accent — one place to change it, and
      // the fill can never drift from the line.
      className="text-brand mt-3 h-16 w-full overflow-visible"
    >
      <defs>
        <linearGradient id="intake-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill="url(#intake-fill)" />

      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
