// The backend's own copy of src/utils/nextPath.ts. It exists because the OAuth
// callback is the first place the SERVER builds a redirect to the frontend out
// of a query parameter — until 0023 every `next` was consumed in the browser,
// where the frontend's copy was the only guard needed.
//
// next-path-fixture.json at the repo root holds both packages to the same
// answers; nextPath.parity.test.ts here and in the frontend read it.
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;

  if (!raw.startsWith("/")) return null;

  // "//evil.test" is read as a host by the browser, and some browsers
  // normalise the backslash in "/\evil.test" to a slash.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;

  return raw;
}
