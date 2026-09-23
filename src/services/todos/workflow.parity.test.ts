import { describe, expect, it } from "vitest";

// Imported rather than read with node:fs, for the reason
// permissions.parity.test.ts records: tsconfig.app.json pins `types` to
// vite/client, and Vite resolves the JSON natively. The backend copy reads the
// same file with readFileSync because its tsconfig cannot import outside
// rootDir — the two arrive at the fixture differently and assert the same thing.
import matrix from "../../../workflow-matrix.json";

import { WORKFLOW_STAGES, canTransition, stagesBetween } from "./workflow";

const fixture = matrix as unknown as {
  stages: string[];
  canTransition: { from: string | null; to: string | null; expected: boolean }[];
  stagesBetween: { from: string | null; to: string | null; expected: string[] }[];
};

describe("workflow parity (frontend mirror)", () => {
  it("has the backend's stages, in the backend's order", () => {
    expect([...WORKFLOW_STAGES]).toEqual(fixture.stages);
  });

  it("agrees with the fixture on every transition", () => {
    for (const row of fixture.canTransition) {
      expect(canTransition(row.from, row.to), `${row.from} -> ${row.to}`).toBe(
        row.expected,
      );
    }
  });

  it("agrees with the fixture on the stages a refused move skips", () => {
    for (const row of fixture.stagesBetween) {
      expect(stagesBetween(row.from, row.to), `${row.from} -> ${row.to}`).toEqual(
        row.expected,
      );
    }
  });
});
