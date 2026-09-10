import { describe, expect, it } from "vitest";

import {
  backlogRankForAppend,
  backlogRankForDrop,
  byBacklogRank,
  effectiveBacklogRank,
  RANK_GAP,
} from "./backlogRank";

const AT = (day: number) =>
  `2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`;

let seq = 0;

function row(
  backlog_rank: number | null,
  over: { id?: string; created_at?: string } = {},
) {
  seq += 1;

  return {
    backlog_rank,
    id: over.id ?? `row-${seq}`,
    created_at: over.created_at ?? AT(1),
  };
}

describe("effectiveBacklogRank", () => {
  it("is the real rank when the row has one", () => {
    expect(effectiveBacklogRank(row(2048))).toBe(2048);
  });

  it("falls back to the row's own creation time when it has none", () => {
    expect(effectiveBacklogRank(row(null, { created_at: AT(3) }))).toBe(
      Date.parse(AT(3)),
    );
  });

  it("degrades an unparseable stamp to 0 rather than NaN", () => {
    expect(effectiveBacklogRank(row(null, { created_at: "not a date" }))).toBe(
      0,
    );
  });
});

describe("byBacklogRank", () => {
  it("sorts ascending by backlog_rank", () => {
    const rows = [row(3000), row(1000), row(2000)];

    expect(rows.sort(byBacklogRank).map((r) => r.backlog_rank)).toEqual([
      1000, 2000, 3000,
    ]);
  });

  it("sorts a never-placed row after a low-ranked one", () => {
    const rows = [row(1000), row(null, { created_at: AT(2) }), row(500)];

    expect(rows.sort(byBacklogRank).map((r) => r.backlog_rank)).toEqual([
      500, 1000, null,
    ]);
  });

  it("orders never-placed rows among themselves by creation time", () => {
    const older = row(null, { id: "older", created_at: AT(1) });
    const newer = row(null, { id: "newer", created_at: AT(2) });

    expect([newer, older].sort(byBacklogRank).map((r) => r.id)).toEqual([
      "older",
      "newer",
    ]);
  });

  it("is a TOTAL order: the same rows sort identically from any input order", () => {
    // regression: Infinity as the null fallback made two unranked rows compare NaN, so sort kept input order
    const a = row(null, { id: "a", created_at: AT(1) });
    const b = row(null, { id: "b", created_at: AT(2) });
    const c = row(null, { id: "c", created_at: AT(3) });
    const d = row(null, { id: "d", created_at: AT(4) });

    const one = [a, b, c, d].sort(byBacklogRank).map((r) => r.id);
    const another = [c, a, d, b].sort(byBacklogRank).map((r) => r.id);

    expect(one).toEqual(another);
    expect(one).toEqual(["a", "b", "c", "d"]);
  });

  it("is ROW-INTRINSIC: ranking one row keeps it where it was placed", () => {
    // regression: a list-relative fallback jumped a newly-ranked row to the front once it left the unranked tail
    const a = row(null, { id: "a", created_at: AT(1) });
    const b = row(null, { id: "b", created_at: AT(2) });
    const c = row(null, { id: "c", created_at: AT(3) });

    const between = backlogRankForDrop([a, b, c], 1);

    expect(between).not.toBeNull();

    const placed = { ...row(between, { id: "d" }), created_at: AT(4) };

    expect([a, b, c, placed].sort(byBacklogRank).map((r) => r.id)).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("breaks a tie on id so the order is total", () => {
    const first = row(1000, { id: "a" });
    const second = row(1000, { id: "z" });

    expect([second, first].sort(byBacklogRank).map((r) => r.id)).toEqual([
      "a",
      "z",
    ]);
  });
});

describe("backlogRankForAppend", () => {
  it("is the first gap's worth of rank for an empty list", () => {
    expect(backlogRankForAppend([])).toBe(RANK_GAP);
  });

  it("is the largest existing rank plus one gap", () => {
    expect(backlogRankForAppend([row(1000), row(3000), row(2000)])).toBe(
      3000 + RANK_GAP,
    );
  });

  it("counts a never-placed row, since it is really down there", () => {
    const untouched = row(null, { created_at: AT(2) });

    expect(backlogRankForAppend([row(1000), untouched])).toBe(
      Date.parse(AT(2)) + RANK_GAP,
    );
  });

  it("still returns a finite rank when every row is unranked", () => {
    const rows = [
      row(null, { created_at: AT(1) }),
      row(null, { created_at: AT(2) }),
    ];

    expect(backlogRankForAppend(rows)).toBe(Date.parse(AT(2)) + RANK_GAP);
  });
});

describe("backlogRankForDrop", () => {
  const list = [row(1000), row(2000), row(3000)];

  it("drops at the top, below nothing", () => {
    expect(backlogRankForDrop(list, 0)).toBe(500);
  });

  it("drops at the bottom, above everything", () => {
    expect(backlogRankForDrop(list, 3)).toBe(3000 + RANK_GAP);
  });

  it("drops strictly between its two neighbours", () => {
    const rank = backlogRankForDrop(list, 1);

    expect(rank).not.toBeNull();
    expect(rank!).toBeGreaterThan(1000);
    expect(rank!).toBeLessThan(2000);
  });

  it("excludes the card being moved from its own neighbour computation", () => {
    const withoutMoved = list.filter((_, i) => i !== 1);

    expect(backlogRankForDrop(withoutMoved, 1)).toBe(2000);
  });

  it("returns null once a gap is exhausted", () => {
    const exhausted = [row(1), row(1 + Number.EPSILON)];

    expect(backlogRankForDrop(exhausted, 1)).toBeNull();
  });

  it("lands strictly between a ranked row and a never-placed one", () => {
    const untouched = row(null, { created_at: AT(2) });
    const rank = backlogRankForDrop([row(1000), untouched], 1);

    expect(rank).not.toBeNull();
    expect(rank!).toBeGreaterThan(1000);
    expect(rank!).toBeLessThan(Date.parse(AT(2)));
  });

  it("gives three different gaps three different, ordered ranks", () => {
    const a = row(null, { id: "a", created_at: AT(1) });
    const b = row(null, { id: "b", created_at: AT(2) });
    const c = row(null, { id: "c", created_at: AT(3) });

    const first = backlogRankForDrop([a, b, c], 1);
    const second = backlogRankForDrop([a, b, c], 2);
    const last = backlogRankForDrop([a, b, c], 3);

    expect(first!).toBeGreaterThan(effectiveBacklogRank(a));
    expect(second!).toBeGreaterThan(first!);
    expect(last!).toBeGreaterThan(second!);
  });
});
