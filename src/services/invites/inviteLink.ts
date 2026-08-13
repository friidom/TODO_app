/**
 * The two pure things the invite UI needs. No React, no network.
 *
 * Both live here rather than inside the modal because they are the parts worth
 * pinning down with a test: an invite URL that is subtly wrong produces a link
 * that 404s for the recipient and looks fine to the sender, and an expiry
 * label is off-by-one arithmetic in disguise.
 */

/**
 * Where an invite token is redeemed.
 *
 * `origin` is passed in rather than read from `window` so this stays pure and
 * testable, and so the caller is the one place that decides which origin a
 * shared link should carry.
 *
 * The token is not encoded: `create_invite` produces 48 hex characters, which
 * are already URL-safe. Encoding would be free insurance, but it would also
 * quietly accept a token shape that should never reach here.
 */
export function inviteUrl(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

/**
 * Whether an invite is past its expiry.
 *
 * To the second, not to the day, unlike `expiresLabel` — this decides whether
 * a row is shown at all, and "expires today" is still usable right up to the
 * instant it is not.
 *
 * The list query already filters on `expires_at` server-side, so this is the
 * second of two passes rather than the only one. It earns its place because
 * the first pass compares against the CLIENT's clock at request time: a
 * response served from the cache, a tab left open, or a machine whose clock is
 * behind can all put an unusable row in front of someone with a Copy button
 * next to it.
 */
export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

/**
 * How long a pending invite has left, as a sentence fragment.
 *
 * Counts whole days by calendar difference in UTC rather than by dividing the
 * millisecond gap: an invite created at 23:00 and expiring in "7 days" is
 * 6.96 days away by the clock, and flooring that reads as 6 — a link that says
 * six days when the sender chose seven looks broken.
 *
 * Already-expired invites are filtered out of the list by the query (M4-07),
 * so "Expired" here is the state of a row that aged out while the modal was
 * open rather than a normal one.
 */
export function expiresLabel(
  expiresAt: string,
  now: Date = new Date(),
): string {
  const days = daysBetween(now, new Date(expiresAt));

  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";

  return `Expires in ${days} days`;
}

/** Whole calendar days from `from` to `to`, in UTC. Negative when `to` is past. */
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
