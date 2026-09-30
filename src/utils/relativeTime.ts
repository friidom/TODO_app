import i18n from "@/components/i18n";

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
  const form = short ? "short" : "ago";

  // clock skew can put this a few seconds in the future — "just now" is honest, "-1m ago" isn't
  if (elapsed < MINUTE) return i18n.t(`time.${form}.now`);

  if (elapsed < HOUR)
    return i18n.t(`time.${form}.minutes`, {
      count: Math.floor(elapsed / MINUTE),
    });

  if (elapsed < DAY)
    return i18n.t(`time.${form}.hours`, { count: Math.floor(elapsed / HOUR) });

  return i18n.t(`time.${form}.days`, { count: Math.floor(elapsed / DAY) });
}
