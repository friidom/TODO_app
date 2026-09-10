// Fractional ordering — a move is a single-row write instead of renumbering (and last-write-wins clobbering) the whole column.

import type { Todo } from "@/types/data";

// Matches the multiplier the backfill migration and rebalance RPCs use.
export const RANK_GAP = 1024;

export interface Ranked {
  rank: number | null;
  position: number | null;
}

export function byRank(a: Ranked, b: Ranked): number {
  return rankOf(a) - rankOf(b);
}

// Falls back to position * RANK_GAP so a row from before the backfill still sorts correctly in a mixed column.
function rankOf(row: Ranked): number {
  return row.rank ?? (row.position ?? 0) * RANK_GAP;
}

// null means precision exhaustion (mantissa ran out after ~50 midpoints into the same gap) — caller rebalances and retries.
export function rankBetween(
  before: number | null,
  after: number | null,
): number | null {
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

// column must already exclude the card being moved, or a same-column move computes the midpoint of its own current gap.
export function rankForDrop(column: Todo[], index: number): number | null {
  const ordered = column.slice().sort(byRank);
  const { before, after } = neighboursAt(ordered, index);

  return rankBetween(before, after);
}
