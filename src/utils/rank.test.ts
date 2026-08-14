import { describe, expect, it } from "vitest";

import {
  RANK_GAP,
  byRank,
  neighboursAt,
  rankBetween,
  rankForAppend,
  rankForDrop,
} from "./rank";
import type { Todo } from "@/types/data";

const row = (rank: number | null, position: number | null = null) => ({
  rank,
  position,
});

const card = (id: string, rank: number | null): Todo =>
  ({ id, rank, position: null, column_id: "c" }) as Todo;

describe("byRank", () => {
  it("orders by rank ascending", () => {
    const rows = [row(3072), row(1024), row(2048)];

    expect(
      rows
        .slice()
        .sort(byRank)
        .map((r) => r.rank),
    ).toEqual([1024, 2048, 3072]);
  });

  it("falls back to position when a rank is missing", () => {
    // The state between the migration and the backfill, and the state of a row
    // written by an older client. It must sort where it belongs rather than
    // jumping to the front, which is what a `?? 0` would have done.
    const rows = [row(3072), row(null, 2), row(1024)];

    expect(
      rows
        .slice()
        .sort(byRank)
        .map((r) => r.rank),
    ).toEqual([1024, null, 3072]);
  });

  it("puts the two scales in the same space", () => {
    // position 2 is what the backfill would have written as 2 * RANK_GAP, so a
    // mixed column is correctly ordered rather than merely not crashing.
    expect(byRank(row(null, 2), row(2 * RANK_GAP))).toBe(0);
  });
});

describe("rankBetween", () => {
  it("gives the first card in an empty column a positive rank", () => {
    expect(rankBetween(null, null)).toBe(RANK_GAP);
  });

  it("appends a constant gap below the last card", () => {
    expect(rankBetween(2048, null)).toBe(2048 + RANK_GAP);
  });

  it("halves above the first card rather than subtracting", () => {
    // `after - RANK_GAP` would march into negative numbers on a column that is
    // repeatedly prepended to; halving keeps every rank positive.
    expect(rankBetween(null, 1024)).toBe(512);
    expect(rankBetween(null, 512)).toBe(256);
  });

  it("takes the midpoint between two neighbours", () => {
    expect(rankBetween(1024, 2048)).toBe(1536);
    expect(rankBetween(1024, 1536)).toBe(1280);
  });

  it("returns a value strictly inside the gap, never an endpoint", () => {
    const middle = rankBetween(1, 2)!;

    expect(middle).toBeGreaterThan(1);
    expect(middle).toBeLessThan(2);
  });

  it("REPORTS EXHAUSTION RATHER THAN COLLIDING", () => {
    // The failure M6-06 exists for. Two adjacent doubles have no value between
    // them, and returning either endpoint would put two cards on one rank —
    // an undefined order, which is the defect M6-A is removing.
    const a = 1;
    const b = a + Number.EPSILON;

    expect(rankBetween(a, b)).toBeNull();
  });

  it("exhausts after repeated midpoints into the same gap, and not before", () => {
    // The plan's M6-04 test as a unit test: "50 consecutive drags of the same
    // card between two neighbours → precision holds or rebalance fires".
    let before = 1024;
    const after = 2048;
    let steps = 0;

    for (;;) {
      const next = rankBetween(before, after);

      if (next === null) break;

      expect(next).toBeGreaterThan(before);
      expect(next).toBeLessThan(after);

      before = next;
      steps += 1;

      // A guard so a bug cannot hang the suite instead of failing it.
      if (steps > 200) break;
    }

    // Comfortably past the 50 the plan names, and bounded — so the rebalance is
    // a rare round trip rather than a constant one.
    expect(steps).toBeGreaterThan(50);
    expect(steps).toBeLessThan(200);
  });

  it("refuses a backwards gap instead of inventing a rank outside it", () => {
    expect(rankBetween(2048, 1024)).toBeNull();
    expect(rankBetween(1024, 1024)).toBeNull();
  });
});

describe("rankForAppend", () => {
  it("starts a column at the gap", () => {
    expect(rankForAppend([])).toBe(RANK_GAP);
  });

  it("goes below the largest rank, whatever order the rows arrive in", () => {
    expect(rankForAppend([row(2048), row(1024), row(3072)])).toBe(
      3072 + RANK_GAP,
    );
  });

  it("counts a rankless row at its position-derived rank", () => {
    expect(rankForAppend([row(null, 3)])).toBe(3 * RANK_GAP + RANK_GAP);
  });
});

describe("neighboursAt", () => {
  const ordered = [row(1024), row(2048), row(3072)];

  it("has no card above the top gap", () => {
    expect(neighboursAt(ordered, 0)).toEqual({ before: null, after: 1024 });
  });

  it("has no card below the bottom gap", () => {
    expect(neighboursAt(ordered, 3)).toEqual({ before: 3072, after: null });
  });

  it("takes the cards either side of an interior gap", () => {
    // The off-by-one worth pinning: `index` is a gap, so the card above it is
    // index - 1 and the card below it is index.
    expect(neighboursAt(ordered, 1)).toEqual({ before: 1024, after: 2048 });
    expect(neighboursAt(ordered, 2)).toEqual({ before: 2048, after: 3072 });
  });

  it("treats an empty column as both ends open", () => {
    expect(neighboursAt([], 0)).toEqual({ before: null, after: null });
  });
});

describe("rankForDrop", () => {
  const column = [card("a", 1024), card("b", 2048), card("c", 3072)];

  it("orders the column itself, so the caller need not", () => {
    const shuffled = [column[2], column[0], column[1]];

    expect(rankForDrop(shuffled, 1)).toBe(rankForDrop(column, 1));
  });

  it("places a drop at each gap", () => {
    expect(rankForDrop(column, 0)).toBe(512);
    expect(rankForDrop(column, 1)).toBe(1536);
    expect(rankForDrop(column, 3)).toBe(3072 + RANK_GAP);
  });

  it("appends when the index is past the end", () => {
    // A gap index beyond the column is what a filtered board can produce; it
    // means the bottom, not an error.
    expect(rankForDrop(column, 99)).toBe(3072 + RANK_GAP);
  });

  it("starts an empty destination column at the gap", () => {
    expect(rankForDrop([], 0)).toBe(RANK_GAP);
  });
});
