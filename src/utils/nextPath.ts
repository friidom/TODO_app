// Open-redirect guard — `next` comes from the query string, so it's attacker-controlled.
// Rejects absolute URLs, protocol-relative "//evil.test" (browser reads that as a host), and "/\evil.test" (some browsers normalize the backslash to a slash).
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;

  if (!raw.startsWith("/")) return null;

  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;

  return raw;
}
