import i18n from "@/components/i18n";

// origin is passed in, not read from window, so this stays pure and testable
export function inviteUrl(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

// second pass after the server-side filter — catches a stale cache, a tab left open, or a clock that's behind
export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function expiresLabel(
  expiresAt: string,
  now: Date = new Date(),
): string {
  const days = daysBetween(now, new Date(expiresAt));

  if (days < 0) return i18n.t("invites.expired");
  if (days === 0) return i18n.t("invites.expiresToday");
  if (days === 1) return i18n.t("invites.expiresTomorrow");

  return i18n.t("invites.expiresIn", { count: days });
}

// whole calendar days, not a millisecond division — a 23:00 invite expiring in "7 days" is 6.96 by the clock, which floors wrong
function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000;

  const fromDay = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const toDay = Date.UTC(
    to.getUTCFullYear(),
    to.getUTCMonth(),
    to.getUTCDate(),
  );

  return Math.round((toDay - fromDay) / MS_PER_DAY);
}
