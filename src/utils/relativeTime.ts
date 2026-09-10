// Not Intl.RelativeTimeFormat — that needs a unit already chosen, and picking the unit is the whole job here.
// Takes `now` instead of reading the clock so it's testable without freezing time.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(
  iso: string | null,
  now: number = Date.now(),
  { short = false }: { short?: boolean } = {},
): string | null {
  if (!iso) return null;

  const then = new Date(iso).getTime();

  if (Number.isNaN(then)) return null;

  const elapsed = now - then;
  const suffix = short ? "" : " ago";

  // clock skew can put this a few seconds in the future — "just now" is honest, "-1m ago" isn't
  if (elapsed < MINUTE) return short ? "now" : "just now";

  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m${suffix}`;

  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h${suffix}`;

  return `${Math.floor(elapsed / DAY)}d${suffix}`;
}
