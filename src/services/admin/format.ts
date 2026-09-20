import type { Bucket } from "./types";

export const NO_VALUE = "—";

// The admin screens are written in English, so their dates are too. Left to
// the operating system, toLocaleDateString rendered "13 сент." beside English
// headings on a Russian-locale machine.
export const LOCALE = "en-GB";

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
      return at.toLocaleTimeString(LOCALE, {
        hour: "2-digit",
        timeZone: "UTC",
      });
    case "month":
      return at.toLocaleDateString(LOCALE, {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
    case "week":
    case "day":
      return at.toLocaleDateString(LOCALE, {
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

  return `${start.toLocaleDateString(LOCALE, options)} – ${end.toLocaleDateString(LOCALE, options)}`;
}

export function barWidth(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "0%";

  // Floored at 2%, so a real but tiny value never rounds to an invisible bar
  // and reads as nothing done.
  return `${Math.max(2, Math.round((value / max) * 100))}%`;
}

// Actions reach the UI in the shape their storage wants: the activities
// table uses the enum activities_event_valid allows ('estimate_changed') and
// admin_audit_log namespaces with a dot ('kpi_target.updated'). Both are the
// right shape for a constraint and the wrong one for a table cell.
const ACRONYMS: Record<string, string> = { kpi: "KPI" };

export function actionLabel(action: string): string {
  const words = action
    .split(/[._]/)
    .filter(Boolean)
    .map((word) => ACRONYMS[word] ?? word);

  if (words.length === 0) return "";

  const [first, ...rest] = words;

  return [first!.charAt(0).toUpperCase() + first!.slice(1), ...rest].join(" ");
}
