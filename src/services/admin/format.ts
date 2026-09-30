import i18n from "@/components/i18n";
import type { Bucket } from "./types";

export const NO_VALUE = "—";

// The app's language, never the operating system's: left to the OS,
// toLocaleDateString rendered "13 сент." beside English headings. English
// keeps en-GB's day-before-month order.
export function adminLocale(): string {
  return i18n.language.startsWith("en") ? "en-GB" : i18n.language;
}

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
      return at.toLocaleTimeString(adminLocale(), {
        hour: "2-digit",
        timeZone: "UTC",
      });
    case "month":
      return at.toLocaleDateString(adminLocale(), {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
    case "week":
    case "day":
      return at.toLocaleDateString(adminLocale(), {
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

  return `${start.toLocaleDateString(adminLocale(), options)} – ${end.toLocaleDateString(adminLocale(), options)}`;
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
  const english = [
    first!.charAt(0).toUpperCase() + first!.slice(1),
    ...rest,
  ].join(" ");

  return i18n.t(`adminActions.${action}`, { defaultValue: english });
}

export function formatDuration(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) {
    return NO_VALUE;
  }

  if (days < 0) return NO_VALUE;

  if (days >= 1) return i18n.t("admin.duration.days", { value: format(days) });

  const hours = days * 24;

  if (hours >= 1)
    return i18n.t("admin.duration.hours", { value: format(hours) });

  return i18n.t("admin.duration.minutes", { value: Math.round(hours * 60) });
}

// The API labels aging buckets "3–7d" / "30d+" in English; only the unit is
// the reader's.
export function dayRangeLabel(label: string): string {
  const match = /^([\d–-]+)d(\+?)$/.exec(label);

  if (!match) return label;

  return i18n.t(match[2] ? "admin.duration.daysPlus" : "admin.duration.days", {
    value: match[1],
  });
}

// System-wide WIP slices arrive keyed by stage with an English label; a
// board's own slices are keyed by status and labelled with its name, which is
// user data and stays as it is.
const WIP_STAGES: Record<string, string> = {
  backlog: "views.backlog",
  todo: "columnCategory.todo",
  in_progress: "columnCategory.in_progress",
  in_review: "columnCategory.in_review",
  done: "columnCategory.done",
};

export function wipLabel(slice: { key: string; label: string }): string {
  const key = WIP_STAGES[slice.key];

  return key ? i18n.t(key) : slice.label;
}

export function binLabel(bin: {
  from_days: number;
  to_days: number | null;
}): string {
  if (bin.to_days === null) {
    return i18n.t("admin.duration.daysPlus", { value: bin.from_days });
  }

  return bin.to_days - bin.from_days === 1
    ? i18n.t("admin.duration.days", { value: bin.from_days })
    : i18n.t("admin.duration.days", {
        value: `${bin.from_days}–${bin.to_days - 1}`,
      });
}
