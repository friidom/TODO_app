import type { Bucket } from "./types";

export const NO_VALUE = "—";

// "—", never "0%". A user nobody has classified has no target, and a zero
// would be a claim about them that nothing supports (M34 D-8, D-12).
export function dash(value: number | null | undefined): string {
  return value === null || value === undefined ? NO_VALUE : format(value);
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? NO_VALUE : `${format(value)}%`;
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// Bucket keys arrive as a local wall clock the server already truncated in
// APP_TIMEZONE, so they are read back as UTC — parsing them as local time
// would shift a label onto the neighbouring day.
export function bucketLabel(bucket: string, granularity: Bucket): string {
  const at = new Date(`${bucket}Z`);

  if (Number.isNaN(at.getTime())) return bucket;

  switch (granularity) {
    case "hour":
      return at.toLocaleTimeString(undefined, {
        hour: "2-digit",
        timeZone: "UTC",
      });
    case "month":
      return at.toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
    case "week":
    case "day":
      return at.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
  }
}

export function rangeLabel(from: string, to: string): string {
  const start = new Date(from);
  const end = new Date(to);
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
  };

  return `${start.toLocaleDateString(undefined, options)} – ${end.toLocaleDateString(undefined, options)}`;
}

export function barWidth(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "0%";

  // Floored at 2%, so a real but tiny value never rounds to an invisible bar
  // and reads as nothing done.
  return `${Math.max(2, Math.round((value / max) * 100))}%`;
}
