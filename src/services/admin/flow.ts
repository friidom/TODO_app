import type {
  AgingBucket,
  CfdPoint,
  DurationBin,
  DurationStats,
  WipSlice,
} from "./types";

export type CfdBandKey = "done" | "in_progress" | "backlog";

export interface CfdBand {
  key: CfdBandKey;
  label: string;
  upper: number[];
  lower: number[];
}

export const CFD_BANDS: { key: CfdBandKey; label: string; fill: string }[] = [
  { key: "done", label: "Done", fill: "text-status-green" },
  { key: "in_progress", label: "In progress", fill: "text-brand" },
  { key: "backlog", label: "Backlog", fill: "text-ink-3" },
];

// done > started is normal, not a bug: 0016 backfilled no start dates, so
// pre-migration completions have none. Unclamped, the middle band inverts.
function monotonic(points: CfdPoint[]): {
  done: number[];
  started: number[];
  created: number[];
} {
  const done = points.map((point) => Math.max(0, point.done));
  const started = points.map((point, i) => Math.max(point.started, done[i]));
  const created = points.map((point, i) => Math.max(point.created, started[i]));

  return { done, started, created };
}

export const EMPTY_HIDDEN: ReadonlySet<CfdBandKey> = new Set();

function thicknessOf(points: CfdPoint[]): Record<CfdBandKey, number[]> {
  const { done, started, created } = monotonic(points);

  return {
    done,
    in_progress: started.map((value, i) => value - done[i]!),
    backlog: created.map((value, i) => value - started[i]!),
  };
}

export function cfdBands(
  points: CfdPoint[],
  hidden: ReadonlySet<CfdBandKey> = EMPTY_HIDDEN,
): CfdBand[] {
  const thickness = thicknessOf(points);
  const bands: CfdBand[] = [];

  let floor = points.map(() => 0);

  for (const band of CFD_BANDS) {
    if (hidden.has(band.key)) continue;

    const upper = floor.map((base, i) => base + (thickness[band.key][i] ?? 0));

    bands.push({ key: band.key, label: band.label, upper, lower: floor });
    floor = upper;
  }

  return bands;
}

export function cfdPeak(
  points: CfdPoint[],
  hidden: ReadonlySet<CfdBandKey> = EMPTY_HIDDEN,
): number {
  const bands = cfdBands(points, hidden);
  const top = bands.at(-1);

  if (top === undefined) return 1;

  return Math.max(1, ...top.upper);
}

export function cfdTotalAt(points: CfdPoint[], index: number): number {
  const { created } = monotonic(points);

  return created[index] ?? 0;
}

export function bandValueAt(band: CfdBand, index: number): number {
  return Math.max(0, (band.upper[index] ?? 0) - (band.lower[index] ?? 0));
}

export interface PlotScale {
  height: number;
  headroom: number;
  peak: number;
}

export function xOf(index: number, count: number): number {
  return count === 0 ? 0 : (index + 0.5) * (100 / count);
}

export function yOf(value: number, scale: PlotScale): number {
  const { height, headroom, peak } = scale;

  return height - (value / peak) * (height - headroom);
}

// Fritsch-Carlson monotone cubic. Plain Catmull-Rom overshoots, and on a
// cumulative chart an overshoot makes stacked bands visually cross.
export function monotoneSlopes(ys: number[]): number[] {
  const n = ys.length;

  if (n < 2) return new Array<number>(n).fill(0);

  const d: number[] = [];

  for (let i = 0; i < n - 1; i += 1) d.push(ys[i + 1]! - ys[i]!);

  const m: number[] = [d[0]!];

  for (let i = 1; i < n - 1; i += 1) {
    m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2);
  }

  m.push(d[n - 2]!);

  for (let i = 0; i < n - 1; i += 1) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }

    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const squared = a * a + b * b;

    if (squared > 9) {
      const tau = 3 / Math.sqrt(squared);

      m[i] = tau * a * d[i]!;
      m[i + 1] = tau * b * d[i]!;
    }
  }

  return m;
}

interface Segment {
  c1: [number, number];
  c2: [number, number];
  to: [number, number];
}

function curveOf(
  values: number[],
  scale: PlotScale,
): { start: [number, number]; segments: Segment[] } {
  const count = values.length;
  const ys = values.map((value) => yOf(value, scale));
  const xs = values.map((_, i) => xOf(i, count));
  const slopes = monotoneSlopes(ys);
  const reach = count === 0 ? 0 : 100 / count / 3;

  const segments: Segment[] = [];

  for (let i = 0; i < count - 1; i += 1) {
    segments.push({
      c1: [xs[i]! + reach, ys[i]! + slopes[i]! / 3],
      c2: [xs[i + 1]! - reach, ys[i + 1]! - slopes[i + 1]! / 3],
      to: [xs[i + 1]!, ys[i + 1]!],
    });
  }

  return { start: [xs[0] ?? 0, ys[0] ?? 0], segments };
}

const at = (point: [number, number]): string =>
  `${point[0].toFixed(2)},${point[1].toFixed(2)}`;

export function smoothLinePath(values: number[], scale: PlotScale): string {
  if (values.length === 0) return "";

  const { start, segments } = curveOf(values, scale);

  return (
    `M ${at(start)}` +
    segments.map((s) => ` C ${at(s.c1)} ${at(s.c2)} ${at(s.to)}`).join("")
  );
}

export function smoothAreaPath(band: CfdBand, scale: PlotScale): string {
  if (band.upper.length === 0) return "";

  const top = curveOf(band.upper, scale);
  const bottom = curveOf(band.lower, scale);
  const bottomEnd = bottom.segments.at(-1)?.to ?? bottom.start;

  let path = `M ${at(top.start)}`;

  for (const segment of top.segments) {
    path += ` C ${at(segment.c1)} ${at(segment.c2)} ${at(segment.to)}`;
  }

  path += ` L ${at(bottomEnd)}`;

  const anchors = [
    bottom.start,
    ...bottom.segments.map((segment) => segment.to),
  ];

  for (let i = bottom.segments.length - 1; i >= 0; i -= 1) {
    const segment = bottom.segments[i]!;

    path += ` C ${at(segment.c2)} ${at(segment.c1)} ${at(anchors[i]!)}`;
  }

  return `${path} Z`;
}

// Bucket keys are naive local wall clocks the server already truncated in
// APP_TIMEZONE, which bucketLabel also reads back as UTC. The half-open range
// runs to the next bucket, or to the window's end for the last one.
export function bucketRange(
  buckets: string[],
  index: number,
  windowTo: string,
): { from: string; to: string } | null {
  const start = buckets[index];

  if (start === undefined) return null;

  const next = buckets[index + 1];

  return { from: `${start}Z`, to: next === undefined ? windowTo : `${next}Z` };
}

export function histogramPeak(bins: DurationBin[]): number {
  return Math.max(1, ...bins.map((bin) => bin.count));
}

export function percentileOffset(
  days: number | null,
  bins: DurationBin[],
): number | null {
  if (days === null || bins.length === 0) return null;

  const slot = 100 / bins.length;
  const index = bins.findIndex(
    (bin) =>
      days >= bin.from_days && (bin.to_days === null || days < bin.to_days),
  );

  if (index === -1) {
    return days < bins[0].from_days ? 0 : 100;
  }

  const bin = bins[index];
  const span = bin.to_days === null ? null : bin.to_days - bin.from_days;
  const within =
    span === null || span <= 0 ? 0.5 : (days - bin.from_days) / span;

  return index * slot + within * slot;
}

export function totalOf(rows: { count: number }[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

export function barShare(count: number, peak: number): number {
  if (peak <= 0 || count <= 0) return 0;

  return Math.min(100, (count / peak) * 100);
}

export function proportionOf(count: number, total: number): number {
  if (total <= 0) return 0;

  return (count / total) * 100;
}

export function peakOf(rows: { count: number }[]): number {
  return Math.max(1, ...rows.map((row) => row.count));
}

export function wipTotal(slices: WipSlice[]): number {
  return totalOf(slices);
}

export function agingRows(buckets: AgingBucket[]): {
  bucket: AgingBucket;
  percent: number;
  share: number;
}[] {
  const peak = peakOf(buckets);
  const total = totalOf(buckets);

  return buckets.map((bucket) => ({
    bucket,
    percent: barShare(bucket.count, peak),
    share: proportionOf(bucket.count, total),
  }));
}

export function hasDurations(stats: DurationStats): boolean {
  return stats.n > 0 && stats.median_days !== null;
}
