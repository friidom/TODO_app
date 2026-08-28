/**
 * Fractional ordering for the Backlog view (M29) — the same scheme
 * `rank.ts` already uses, applied to `todos.backlog_rank` instead of
 * `todos.rank`.
 *
 * **A second value, not a second scheme.** The migration's own header states
 * the decision: a card's spot in a Sprint's planning list and its spot in a
 * Kanban column are different questions, so they get different columns —
 * but the arithmetic of "a number strictly between two neighbours" does not
 * change depending on which column it is ordering. `rankBetween` is
 * imported and used exactly as `rank.ts` uses it internally; nothing here
 * reimplements the midpoint-or-exhaustion logic.
 *
 * **The fallback for a null `backlog_rank` is the row's own creation time,
 * and getting this wrong is what made the Backlog drag reorder at random.**
 * `rank.ts` never faces the question: its `rankOf` falls back to
 * `position * RANK_GAP`, always a real number, so a Kanban column is always
 * totally ordered. `backlog_rank` has no dense-integer predecessor — it is
 * null on essentially every row, because only a drag on this page has ever
 * written one — so the fallback *is* the ordering for most sections, and it
 * has to satisfy two properties at once:
 *
 * 1. **Total.** The first attempt returned `Number.POSITIVE_INFINITY` for an
 *    unranked row, so comparing two of them computed `Infinity - Infinity` =
 *    `NaN`. A comparator returning `NaN` is neither `< 0` nor `> 0`, so
 *    `Array.prototype.sort` reads every such pair as equal and (being
 *    stable) just preserves the input order. The drop path sorts two
 *    different arrays and needs them to agree — `visible`, from
 *    `useVisibleTodos()` (whose `manual` order is `orderByBoard`, i.e.
 *    column-then-board-rank), and `full`, from the raw `["todos", boardId]`
 *    cache in fetch order — and with the comparator inert each simply kept
 *    its own unrelated order. The gap the user aimed at and the neighbours
 *    the new rank was computed between were then positions in two different
 *    lists.
 *
 * 2. **Row-intrinsic.** The second attempt fixed totality by sorting ranked
 *    rows ahead of unranked ones and numbering the unranked tail relative to
 *    the section's highest real rank. That is stable only while *no* row has
 *    a real rank: the moment one drop writes one, that row leaves the tail
 *    and jumps ahead of every row it was dropped *below*, because their
 *    fallback was defined relative to it. Dropping D between A and B in an
 *    all-unranked `[A, B, C, D]` produced `[D, A, B, C]`. A fallback that
 *    depends on the rest of the list cannot survive one of the list becoming
 *    ranked.
 *
 * `created_at` satisfies both. It is already `not null` on every row, it is
 * immutable, it orders the way an untouched list should (oldest first), and
 * because a row's effective rank never moves, a real rank computed strictly
 * between two of them stays strictly between them forever. Milliseconds
 * since the epoch (~1.7e12) sit far below a double's integer precision
 * (~9e15), leaving roughly a thousand midpoint subdivisions per gap before
 * `rankBetween` reports exhaustion, and comfortably above zero — which
 * `rankBetween`'s own "dropped at the top" branch (`after / 2`, valid only
 * while positive) requires.
 */

import { rankBetween, RANK_GAP } from "./rank";

export { RANK_GAP };

/**
 * Any row ordered by its Backlog-view position.
 *
 * `created_at` and `id` are required rather than optional: both are `not
 * null` on every `todos` row, and they are what makes the ordering total —
 * see the module doc. A caller that cannot supply them does not have a row
 * this module can order.
 */
export interface BacklogRanked {
  backlog_rank: number | null;
  created_at: string;
  id: string;
}

/**
 * Where this row sorts, whether or not it has ever been placed by hand.
 *
 * A real `backlog_rank` wins; otherwise the row's creation time stands in
 * for one. Depends on nothing but the row itself, which is the property the
 * module doc explains at length.
 *
 * An unparseable `created_at` degrades to `0` rather than `NaN` — `NaN`
 * would reintroduce exactly the non-total comparator this replaced.
 */
export function effectiveBacklogRank(row: BacklogRanked): number {
  if (row.backlog_rank !== null) return row.backlog_rank;

  const created = Date.parse(row.created_at);

  return Number.isNaN(created) ? 0 : created;
}

/**
 * Ascending comparator, for `.sort(byBacklogRank)`.
 *
 * Total: effective ranks first, then `id` for the rows an effective rank
 * cannot separate (two rows created in the same millisecond, or two rows
 * genuinely sharing a rank). Two arrays holding the same rows sort to the
 * same sequence whatever order they arrived in — which is what lets the
 * rendered list and the stored list agree about where a gap is.
 */
export function byBacklogRank(a: BacklogRanked, b: BacklogRanked): number {
  const difference = effectiveBacklogRank(a) - effectiveBacklogRank(b);

  return difference !== 0 ? difference : a.id.localeCompare(b.id);
}

/**
 * The rank for a card appended to the bottom of one Backlog-view list — the
 * Backlog section itself, or one Sprint's own section.
 *
 * Measured over *effective* ranks, so "the bottom" means below everything
 * actually rendered, including rows that have never been dragged. Reading
 * only real ranks here — the previous behaviour — put a newly created item
 * at `RANK_GAP` in a section whose untouched rows all sit around 1.7e12,
 * which is the top of the list, not the bottom.
 */
export function backlogRankForAppend(rows: BacklogRanked[]): number {
  if (!rows.length) return RANK_GAP;

  return Math.max(...rows.map(effectiveBacklogRank)) + RANK_GAP;
}

/**
 * The two neighbours a drop at `index` lands between, within one
 * Backlog-view list already ordered by `byBacklogRank`.
 *
 * Mirrors `rank.ts`'s `neighboursAt`, narrowed to this module's effective
 * rank — see the module doc for why the two are kept as separate small
 * functions instead of one generic one.
 */
function neighboursAt(
  ordered: BacklogRanked[],
  index: number,
): { before: number | null; after: number | null } {
  // Clamped for the same reason `rank.ts` clamps: a gap index past the end
  // means the bottom, not "no neighbours at all".
  const at = Math.max(0, Math.min(index, ordered.length));

  const before = at > 0 ? (ordered[at - 1] ?? null) : null;
  const after = ordered[at] ?? null;

  return {
    before: before ? effectiveBacklogRank(before) : null,
    after: after ? effectiveBacklogRank(after) : null,
  };
}

/**
 * The rank a card should take when dropped at `index` of `list`, or null if
 * the list needs rebalancing first (the same exhaustion signal `rankForDrop`
 * gives for the Board).
 *
 * `list` must already exclude the card being moved, for the same reason
 * `rankForDrop` states: a card cannot be its own neighbour.
 */
export function backlogRankForDrop<T extends BacklogRanked>(
  list: T[],
  index: number,
): number | null {
  const ordered = list.slice().sort(byBacklogRank);
  const { before, after } = neighboursAt(ordered, index);

  return rankBetween(before, after);
}
