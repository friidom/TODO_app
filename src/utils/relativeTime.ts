/**
 * How long ago something happened, in the shortest honest form.
 *
 * Added by M17 for the board header's "Last updated" chip. Deliberately tiny
 * and deliberately not `Intl.RelativeTimeFormat`: that formats a *number and a
 * unit you have already chosen*, so it does none of the work here — picking the
 * unit is the whole job — and it would produce "2 minutes ago" where the chip
 * has room for "2m ago".
 *
 * Pure, so it takes `now` rather than reading the clock: a function that reads
 * the clock cannot be tested without freezing time.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(
  iso: string | null,
  now: number = Date.now(),
): string | null {
  if (!iso) return null;

  const then = new Date(iso).getTime();

  // A string the browser cannot parse is not a time, and rendering "NaNm ago"
  // is worse than rendering nothing.
  if (Number.isNaN(then)) return null;

  const elapsed = now - then;

  // A clock skew between the server's timestamp and the browser's puts this in
  // the future by a few seconds. "just now" is the truthful reading of that;
  // "-1m ago" is not.
  if (elapsed < MINUTE) return "just now";

  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;

  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;

  // Days all the way up, with no weeks or months: this labels board activity,
  // and past a few days the exact figure stops mattering while a wrong unit
  // still reads as a bug.
  return `${Math.floor(elapsed / DAY)}d ago`;
}
