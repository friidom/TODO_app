// A deliberate copy of src/utils/rank.ts (§7). The client computes a rank
// optimistically and sends it; the server validates and needs the same
// arithmetic for /rebalance and for the append ranks it computes on create.
// rank.parity.test.ts in each package asserts both copies agree over one
// fixture, so a drift fails a test rather than scrambling a board.
//
// The only difference from the frontend file: rankForDrop takes Ranked[]
// rather than Todo[], because nothing here knows what a Todo is.

export const RANK_GAP = 1024;

export interface Ranked {
  rank: number | null;
  position: number | null;
}

export function byRank(a: Ranked, b: Ranked): number {
  return rankOf(a) - rankOf(b);
}

// Falls back to position * RANK_GAP so a row written before ranks existed still sorts where it belongs.
function rankOf(row: Ranked): number {
  return row.rank ?? (row.position ?? 0) * RANK_GAP;
}

// null means precision exhaustion (the mantissa ran out after ~50 midpoints into one gap) — the caller rebalances and retries.
export function rankBetween(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return RANK_GAP;

  if (before === null) {
    // half the gap, not after - RANK_GAP, so repeated prepends can't go negative
    const next = after! / 2;

    return next > 0 && next < after! ? next : null;
  }

  if (after === null) return before + RANK_GAP;

  if (before >= after) return null;

  const middle = before + (after - before) / 2;

  return middle > before && middle < after ? middle : null;
}

export function rankForAppend(columnRows: Ranked[]): number {
  if (!columnRows.length) return RANK_GAP;

  return Math.max(...columnRows.map(rankOf)) + RANK_GAP;
}

export function neighboursAt(
  ordered: Ranked[],
  index: number,
): { before: number | null; after: number | null } {
  // clamp — an index past the end means "the bottom", not "empty column" (a filtered board can produce one)
  const at = Math.max(0, Math.min(index, ordered.length));

  const before = at > 0 ? (ordered[at - 1] ?? null) : null;
  const after = ordered[at] ?? null;

  return {
    before: before ? rankOf(before) : null,
    after: after ? rankOf(after) : null,
  };
}

// column must already exclude the row being moved, or a same-column move computes the midpoint of its own current gap.
export function rankForDrop(column: Ranked[], index: number): number | null {
  const ordered = column.slice().sort(byRank);
  const { before, after } = neighboursAt(ordered, index);

  return rankBetween(before, after);
}
