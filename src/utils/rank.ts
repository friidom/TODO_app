/**
 * Fractional ordering (M6-A). Replaces the dense integer `position`.
 *
 * **Why the ordering model changed.** A dense integer position means moving one
 * card renumbers every card in both affected columns and writes all of them.
 * With one editor that is wasteful; with two it is silent data loss, because
 * each client renumbers from its own snapshot and the whole array is
 * last-write-wins — B's drag does not conflict with A's, it overwrites it,
 * including cards B never touched. A rank makes a move a **single-row write**,
 * so the only conflict is two people moving the same card.
 *
 * Everything here is pure and takes numbers, not rows, so the arithmetic can be
 * tested without a board — which M6-06 asks for by name, exhaustion being the
 * failure nobody reproduces by hand.
 */

import type { Todo } from "@/types/data";

/**
 * The spacing between adjacent ranks, and the value of the first one.
 *
 * Matches the multiplier in `20260814121000_backfill_ranks.sql` and in the
 * rebalance RPCs. It has to: a client appending after a backfilled row computes
 * `last + RANK_GAP`, and a rebalance the server performs has to leave the board
 * in the same shape the client would have.
 *
 * 1024 rather than 1: it buys ten midpoint insertions before the fractional
 * part starts consuming mantissa at all.
 */
export const RANK_GAP = 1024;

/** Any row ordered by rank, with the legacy position as a fallback. */
export interface Ranked {
  rank: number | null;
  position: number | null;
}

/**
 * Ascending comparator, for `.sort(byRank)`.
 *
 * **Falls back to `position` when a rank is missing**, and that fallback is
 * what makes the deploy order not matter: a row written by an older client, or
 * read between the migration and the backfill, still sorts where it belongs
 * instead of jumping to the front. Multiplying by `RANK_GAP` puts the two
 * scales in the same space, so a mixed column is still correctly ordered rather
 * than merely not crashing — the fallback computes exactly what the backfill
 * would have written.
 *
 * Replaces `byPosition`, which every ordering call site used before M6-A.
 */
export function byRank(a: Ranked, b: Ranked): number {
  return rankOf(a) - rankOf(b);
}

function rankOf(row: Ranked): number {
  return row.rank ?? (row.position ?? 0) * RANK_GAP;
}

/**
 * A rank strictly between two neighbours, or `null` when there is no room left.
 *
 * `null` is **precision exhaustion**, not an error: about 50 consecutive
 * midpoints into the same gap and a `double precision` mantissa runs out, at
 * which point the midpoint comes back equal to one of the neighbours. Returning
 * null before writing is what keeps two cards from landing on one rank — the
 * caller rebalances the column and retries, which is M6-06.
 *
 * @param before the rank of the card above the gap, or null at the top
 * @param after  the rank of the card below the gap, or null at the bottom
 */
export function rankBetween(
  before: number | null,
  after: number | null,
): number | null {
  // Empty column.
  if (before === null && after === null) return RANK_GAP;

  // Dropped at the top: half the gap below the first card rather than
  // `after - RANK_GAP`, which would march into negative numbers on a column
  // that is repeatedly prepended to. Halving keeps every rank positive, and
  // exhausts into the same rebalance as anywhere else.
  if (before === null) {
    const next = after! / 2;

    return next > 0 && next < after! ? next : null;
  }

  // Dropped at the bottom: the only place ranks grow, and they grow by a
  // constant rather than doubling, so a long-lived column stays far from the
  // 2^53 ceiling.
  if (after === null) return before + RANK_GAP;

  // A caller that hands these over backwards has a bug worth surfacing here
  // rather than silently producing a rank outside the gap it asked about.
  if (before >= after) return null;

  const middle = before + (after - before) / 2;

  // The exhaustion test, and it is `<=`/`>=` rather than `===` on purpose:
  // what matters is that the result is *strictly* between, not that it differs
  // from one particular endpoint.
  return middle > before && middle < after ? middle : null;
}

/**
 * The rank for a card being appended to a column — the bottom gap.
 *
 * Takes the column's rows rather than a number so callers do not each re-derive
 * "the largest rank in here", which is the kind of one-liner that ends up
 * subtly different in three places.
 */
export function rankForAppend(columnRows: Ranked[]): number {
  if (!columnRows.length) return RANK_GAP;

  return Math.max(...columnRows.map(rankOf)) + RANK_GAP;
}

/**
 * The two neighbours a drop at `index` lands between, within an already-ordered
 * column that no longer contains the card being moved.
 *
 * Split out from the drop path because it is the part with an off-by-one worth
 * pinning down: `index` is a *gap*, so the card above it is `index - 1` and the
 * card below it is `index`.
 */
export function neighboursAt(
  ordered: Ranked[],
  index: number,
): { before: number | null; after: number | null } {
  // Clamped, because a gap index past the end means the bottom, not "no
  // neighbours at all". Without this, an index of 99 into a three-card column
  // reads as an empty column and the card lands at the *top* — reachable from
  // a filtered board, where the visible gap index can exceed the stored column.
  const at = Math.max(0, Math.min(index, ordered.length));

  const before = at > 0 ? (ordered[at - 1] ?? null) : null;
  const after = ordered[at] ?? null;

  return {
    before: before ? rankOf(before) : null,
    after: after ? rankOf(after) : null,
  };
}

/**
 * The rank a card should take when dropped at `index` of `column`, or null if
 * the column needs rebalancing first.
 *
 * `column` must already exclude the card being moved — a card cannot be its own
 * neighbour, and including it makes a same-column move compute the midpoint of
 * the gap it currently occupies, which is where it already is.
 */
export function rankForDrop(column: Todo[], index: number): number | null {
  const ordered = column.slice().sort(byRank);
  const { before, after } = neighboursAt(ordered, index);

  return rankBetween(before, after);
}
