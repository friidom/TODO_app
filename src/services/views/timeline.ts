import { addDays, addMonths, startOfMonth, startOfWeek } from "./calendar";

// pure string math over YYYY-MM-DD, Date only used at the very edge for formatting — see calendar.ts

export const TIMELINE_SCALES = ["weeks", "months", "quarters"] as const;

export type TimelineScale = (typeof TIMELINE_SCALES)[number];

export const TIMELINE_WINDOW: Record<
  TimelineScale,
  { ticks: number; span: number }
> = {
  weeks: { ticks: 42, span: 1 },
  months: { ticks: 26, span: 7 },
  quarters: { ticks: 53, span: 7 },
};

export interface DaySpan {
  start: string;
  end: string;
}

export function startOfQuarter(day: string): string {
  const month = Number(day.slice(5, 7));
  const first = month - ((month - 1) % 3);

  return `${day.slice(0, 4)}-${String(first).padStart(2, "0")}-01`;
}

function quarterKey(day: string): string {
  return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
}

// a week of lead-in, so today is never pinned to the left edge
export function timelineTicks(scale: TimelineScale, anchor: string): string[] {
  const { ticks, span } = TIMELINE_WINDOW[scale];

  const first =
    scale === "weeks"
      ? addDays(startOfWeek(anchor), -7)
      : startOfWeek(
          scale === "months" ? startOfMonth(anchor) : startOfQuarter(anchor),
        );

  return Array.from({ length: ticks }, (_, i) => addDays(first, i * span));
}

export function windowEnd(ticks: string[], scale: TimelineScale): string {
  const last = ticks[ticks.length - 1];

  return addDays(last, TIMELINE_WINDOW[scale].span);
}

export function windowDays(ticks: string[], scale: TimelineScale): number {
  return ticks.length * TIMELINE_WINDOW[scale].span;
}

function offsetOf(day: string, ticks: string[]): number {
  return Math.round(
    (utc(day).getTime() - utc(ticks[0]).getTime()) / 86_400_000,
  );
}

export function dayIndex(
  day: string,
  ticks: string[],
  scale: TimelineScale,
): number | null {
  if (ticks.length === 0) return null;

  const offset = offsetOf(day, ticks);

  return offset < 0 || offset >= windowDays(ticks, scale) ? null : offset;
}

// days from the window's first day, `to` exclusive
export interface Placement {
  from: number;
  to: number;
  total: number;
  openStart: boolean;
  openEnd: boolean;
}

export function placeItem(
  item: DaySpan,
  ticks: string[],
  scale: TimelineScale,
): Placement | null {
  if (ticks.length === 0) return null;

  const total = windowDays(ticks, scale);
  const from = offsetOf(item.start, ticks);
  const to = offsetOf(item.end, ticks) + 1;

  if (to <= 0 || from >= total) return null;

  return {
    from: Math.max(0, from),
    to: Math.min(total, to),
    total,
    openStart: from < 0,
    openEnd: to > total,
  };
}

// generic over anything placeItem can place — sprint bands reuse it too
export function placeItems<T extends DaySpan>(
  items: T[],
  ticks: string[],
  scale: TimelineScale,
): { item: T; place: Placement }[] {
  const placed = [];

  for (const item of items) {
    const place = placeItem(item, ticks, scale);

    if (place) placed.push({ item, place });
  }

  return placed;
}

export type HeaderBand = {
  key: string;
  kind: "quarter" | "month" | "day";
  from: number;
  to: number;
};

function calendarBands(
  ticks: string[],
  scale: TimelineScale,
  kind: "month" | "quarter",
): HeaderBand[] {
  const total = windowDays(ticks, scale);
  const bands: HeaderBand[] = [];

  for (let day = ticks[0]; offsetOf(day, ticks) < total;) {
    const next =
      kind === "month"
        ? addMonths(startOfMonth(day), 1)
        : addMonths(startOfQuarter(day), 3);

    bands.push({
      key: kind === "month" ? day.slice(0, 7) : quarterKey(day),
      kind,
      from: offsetOf(day, ticks),
      to: Math.min(total, offsetOf(next, ticks)),
    });

    day = next;
  }

  return bands;
}

// Months and quarters follow the calendar, not the columns: a month begins on
// its 1st even mid-week. Quarters are too dense to label columns, so their
// second row names the months.
export function headerBands(
  ticks: string[],
  scale: TimelineScale,
): { major: HeaderBand[]; minor: HeaderBand[] } {
  if (ticks.length === 0) return { major: [], minor: [] };

  if (scale === "quarters") {
    return {
      major: calendarBands(ticks, scale, "quarter"),
      minor: calendarBands(ticks, scale, "month"),
    };
  }

  const { span } = TIMELINE_WINDOW[scale];

  return {
    major: calendarBands(ticks, scale, "month"),
    minor: ticks.map((day, index) => ({
      key: day,
      kind: "day",
      from: index * span,
      to: (index + 1) * span,
    })),
  };
}

export function bandAnchor(key: string): string {
  return `${key}-01`;
}

const MONTH_FORMAT = { timeZone: "UTC" } as const;

// "Sep" rather than a truncated "Septer" when the band is too narrow for the long form.
export function bandLabel(
  band: Pick<HeaderBand, "key" | "kind">,
  locale?: string,
  { short = false }: { short?: boolean } = {},
): string {
  if (band.kind === "day") return tickLabel(band.key);

  if (band.kind === "month") {
    return utc(bandAnchor(band.key)).toLocaleDateString(locale, {
      ...MONTH_FORMAT,
      month: short ? "short" : "long",
      ...(short ? {} : { year: "numeric" }),
    });
  }

  const [year, quarter] = band.key.split("-Q").map(Number);
  const first = utc(
    `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`,
  );
  const last = utc(
    `${year}-${String((quarter - 1) * 3 + 3).padStart(2, "0")}-01`,
  );
  const month = { ...MONTH_FORMAT, month: short ? "short" : "long" } as const;

  return `${first.toLocaleDateString(locale, month)} – ${last.toLocaleDateString(locale, month)}${short ? "" : ` ${year}`}`;
}

// Where a day's middle falls across the track, 0..1.
export function dayFraction(
  day: string,
  ticks: string[],
  scale: TimelineScale,
): number | null {
  const index = dayIndex(day, ticks, scale);

  return index === null ? null : (index + 0.5) / windowDays(ticks, scale);
}

function utc(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, date));
}

export function windowLabel(
  ticks: string[],
  scale: TimelineScale,
  locale?: string,
): string {
  if (ticks.length === 0) return "";

  const first = ticks[0];
  const last = addDays(windowEnd(ticks, scale), -1);

  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);

  const startOptions: Intl.DateTimeFormatOptions = sameMonth
    ? { day: "numeric", timeZone: "UTC" }
    : sameYear
      ? { day: "numeric", month: "short", timeZone: "UTC" }
      : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };

  return `${utc(first).toLocaleDateString(locale, startOptions)} – ${utc(
    last,
  ).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

export function tickLabel(day: string): string {
  return String(Number(day.slice(8, 10)));
}

export function stepAnchor(
  scale: TimelineScale,
  anchor: string,
  direction: -1 | 1,
): string {
  if (scale === "weeks") return addDays(anchor, direction * 7);

  return addMonths(anchor, direction * (scale === "quarters" ? 3 : 1));
}

export function isCurrentAnchor(
  scale: TimelineScale,
  anchor: string,
  today: string,
): boolean {
  if (scale === "weeks") return startOfWeek(anchor) === startOfWeek(today);

  if (scale === "quarters") return quarterKey(anchor) === quarterKey(today);

  return anchor.slice(0, 7) === today.slice(0, 7);
}
