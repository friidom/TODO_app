import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { WORKFLOW_STAGES, canTransition, stagesBetween } from "./workflow.js";

// The same assertions run in both packages against one fixture. workflow.ts is
// duplicated into src/services/todos/workflow.ts for the reason permissions.ts
// is: the frontend needs the rule to decide what to OFFER, while this copy
// decides what is ALLOWED. If the two drift, one of these two tests fails
// instead of the board offering a move the API then refuses.
const fixture = JSON.parse(
  readFileSync(new URL("../../../workflow-matrix.json", import.meta.url), "utf8"),
) as {
  stages: string[];
  canTransition: { from: string | null; to: string | null; expected: boolean }[];
  stagesBetween: { from: string | null; to: string | null; expected: string[] }[];
};

describe("workflow parity (backend, the enforcement)", () => {
  it("has the fixture's stages, in its order", () => {
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
