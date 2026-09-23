import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { safeNext } from "./nextPath.js";

// The same assertions run in both packages against one fixture, the way
// rank.parity.test.ts and workflow.parity.test.ts already do. nextPath.ts is
// duplicated because the frontend consumes `next` in the browser and the
// backend now builds a Location header from it in the OAuth callback; a
// divergence would be an open redirect on whichever side relaxed first.
//
// readFileSync rather than an import, because this tsconfig cannot import from
// outside rootDir.
const fixture = JSON.parse(
  readFileSync(new URL("../../../next-path-fixture.json", import.meta.url), "utf8"),
) as { safe: string[]; rejected: string[] };

describe("safeNext parity", () => {
  it("accepts every path the fixture calls safe", () => {
    for (const path of fixture.safe) {
      expect(safeNext(path), path).toBe(path);
    }
  });

  it("rejects every path the fixture calls unsafe", () => {
    for (const path of fixture.rejected) {
      expect(safeNext(path), path).toBeNull();
    }
  });

  it("rejects absent input", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });

  it("covers both protocol-relative spellings a browser would follow", () => {
    expect(fixture.rejected).toContain("//evil.test");
    expect(fixture.rejected).toContain("/\\evil.test");
  });
});
