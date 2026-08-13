/**
 * Where to send someone after they sign in, when they were headed elsewhere.
 *
 * Introduced for `/invite/:token`: a signed-out visitor with an invite link is
 * sent to `/login?next=/invite/<token>` and has to come back afterwards, or
 * the link is lost and they land on a board index that does not yet include
 * the board they were invited to.
 *
 * **This is an open-redirect guard, which is why it is a function and not a
 * `??`.** `next` comes from the query string, so it is attacker-controlled: a
 * link to `/login?next=https://evil.example/login` would, without this, hand
 * a freshly authenticated user to a convincing copy of the sign-in page. The
 * rule is that only a path within this application is honoured.
 *
 * What is rejected, and why each one matters:
 *
 *   https://evil.test   — absolute URL, the obvious case
 *   //evil.test         — protocol-relative; the browser reads this as a HOST,
 *                         and it is the case a naive `startsWith("/")` misses
 *   /\evil.test         — backslash, which several browsers normalise to `/`
 *   javascript:…        — no leading slash, so already rejected, but named
 *                         because it is what a redirect helper is usually
 *                         attacked with
 *
 * Returns null rather than a default, so the caller states its own — a login
 * lands on `/`, but another caller might not.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;

  if (!raw.startsWith("/")) return null;

  // A second leading slash of either kind makes this a host, not a path.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;

  return raw;
}
