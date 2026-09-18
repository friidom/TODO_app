import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  byRank,
  neighboursAt,
  RANK_GAP,
  rankBetween,
  rankForAppend,
  rankForDrop,
  type Ranked,
} from "./rank.js";

// The same assertions run in both packages against one fixture. rank.ts is
// deliberately duplicated (§7) because a shared workspace package would add
// build tooling this project does not have; this fixture is the mitigation.
// Read with readFileSync rather than imported, because this tsconfig cannot
// import from outside rootDir — the frontend copy imports the same file and
// asserts exactly the same thing.
const fixture = JSON.parse(
  readFileSync(new URL("../../../rank-fixture.json", import.meta.url), "utf8"),
) as {
  rankGap: number;
  byRank: { a: Ranked; b: Ranked; expected: number }[];
  rankBetween: { before: number | null; after: number | null; expected: number | null }[];
  rankForAppend: { rows: Ranked[]; expected: number }[];
  neighboursAt: {
    ordered: Ranked[];
    index: number;
    expected: { before: number | null; after: number | null };
  }[];
  rankForDrop: { column: Ranked[]; index: number; expected: number | null }[];
};

describe("rank parity", () => {
  it("agrees on RANK_GAP", () => {
    expect(RANK_GAP).toBe(fixture.rankGap);
  });

  it(`agrees on byRank for all ${fixture.byRank.length} cases`, () => {
    for (const { a, b, expected } of fixture.byRank) {
      expect(byRank(a, b), `byRank(${JSON.stringify(a)}, ${JSON.stringify(b)})`).toBe(expected);
    }
  });

  it(`agrees on rankBetween for all ${fixture.rankBetween.length} cases`, () => {
    for (const { before, after, expected } of fixture.rankBetween) {
      expect(rankBetween(before, after), `rankBetween(${before}, ${after})`).toBe(expected);
    }
  });

  it(`agrees on rankForAppend for all ${fixture.rankForAppend.length} cases`, () => {
    for (const { rows, expected } of fixture.rankForAppend) {
      expect(rankForAppend(rows), `rankForAppend(${JSON.stringify(rows)})`).toBe(expected);
    }
  });

  it(`agrees on neighboursAt for all ${fixture.neighboursAt.length} cases`, () => {
    for (const { ordered, index, expected } of fixture.neighboursAt) {
      expect(neighboursAt(ordered, index), `neighboursAt(…, ${index})`).toEqual(expected);
    }
  });

  it(`agrees on rankForDrop for all ${fixture.rankForDrop.length} cases`, () => {
    for (const { column, index, expected } of fixture.rankForDrop) {
      expect(rankForDrop(column, index), `rankForDrop(…, ${index})`).toBe(expected);
    }
  });
});
