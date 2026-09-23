import { describe, expect, it } from "vitest";

// Imported rather than read with node:fs, for the reason
// permissions.parity.test.ts records: tsconfig.app.json pins `types` to
// vite/client, and Vite resolves the JSON natively. The backend copy reads the
// same file with readFileSync because its tsconfig cannot import outside
// rootDir — the two arrive at the fixture differently and assert the same thing.
import fixtureJson from "../../next-path-fixture.json";

import { safeNext } from "./nextPath";

// Both copies guard `next` against open redirects — here before a client-side
// navigation, in the backend before the OAuth callback turns it into a
// Location header.
const fixture = fixtureJson as unknown as { safe: string[]; rejected: string[] };

describe("safeNext parity (frontend mirror)", () => {
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
});
