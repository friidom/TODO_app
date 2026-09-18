import { describe, expect, it } from "vitest";

// Imported rather than read with node:fs: tsconfig.app.json pins `types` to
// vite/client, and Vite resolves the JSON natively. The backend copy of this
// test reads the same file with readFileSync, because its tsconfig cannot
// import from outside rootDir — the two arrive at the fixture differently and
// assert exactly the same thing.
import fixtureJson from "../../rank-fixture.json";

import {
  RANK_GAP,
  byRank,
  neighboursAt,
  rankBetween,
  rankForAppend,
  rankForDrop,
  type Ranked,
} from "./rank";
import type { Todo } from "@/types/data";

// The same assertions run in both packages against one fixture. rank.ts is
// deliberately duplicated (§7) because a shared workspace package would add
// build tooling this project does not have; this fixture is the mitigation.
// If the two copies drift, one of these two tests fails instead of a board
// quietly disagreeing with the server about where a card goes.
const fixture = fixtureJson as unknown as {
  rankGap: number;
  byRank: { a: Ranked; b: Ranked; expected: number }[];
  rankBetween: {
    before: number | null;
    after: number | null;
    expected: number | null;
  }[];
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
      expect(
        byRank(a, b),
        `byRank(${JSON.stringify(a)}, ${JSON.stringify(b)})`,
      ).toBe(expected);
    }
  });

  it(`agrees on rankBetween for all ${fixture.rankBetween.length} cases`, () => {
    for (const { before, after, expected } of fixture.rankBetween) {
      expect(rankBetween(before, after), `rankBetween(${before}, ${after})`).toBe(
        expected,
      );
    }
  });

  it(`agrees on rankForAppend for all ${fixture.rankForAppend.length} cases`, () => {
    for (const { rows, expected } of fixture.rankForAppend) {
      expect(rankForAppend(rows), `rankForAppend(${JSON.stringify(rows)})`).toBe(
        expected,
      );
    }
  });

  it(`agrees on neighboursAt for all ${fixture.neighboursAt.length} cases`, () => {
    for (const { ordered, index, expected } of fixture.neighboursAt) {
      expect(neighboursAt(ordered, index), `neighboursAt(…, ${index})`).toEqual(
        expected,
      );
    }
  });

  // rankForDrop takes Todo[] here and Ranked[] on the server; the fixture rows
  // carry only the two fields the arithmetic reads.
  it(`agrees on rankForDrop for all ${fixture.rankForDrop.length} cases`, () => {
    for (const { column, index, expected } of fixture.rankForDrop) {
      expect(
        rankForDrop(column as unknown as Todo[], index),
        `rankForDrop(…, ${index})`,
      ).toBe(expected);
    }
  });
});
