// An OAuth authorization code is a live bearer credential, and it arrives as a
// GET query parameter — the one place an access log is guaranteed to print it.
const SENSITIVE = new Set([
  "code",
  "state",
  "token",
  "id_token",
  "access_token",
  "refresh_token",
  "code_verifier",
  "client_secret",
  "link",
]);

// No brackets: URLSearchParams.toString() percent-encodes them, and
// "code=%5Bredacted%5D" in an access log is needlessly hard to read.
const REDACTED = "REDACTED";

// Takes a string rather than a URL: originalUrl is a path, and a malformed one
// must still log rather than throw from inside a logger.
export function redactUrl(url: string): string {
  const split = url.indexOf("?");

  if (split === -1) return url;

  const path = url.slice(0, split);
  const params = new URLSearchParams(url.slice(split + 1));

  let touched = false;

  for (const key of [...params.keys()]) {
    if (SENSITIVE.has(key.toLowerCase())) {
      params.set(key, REDACTED);
      touched = true;
    }
  }

  return touched ? `${path}?${params.toString()}` : url;
}
