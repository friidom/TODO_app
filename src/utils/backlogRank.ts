// Same fractional-rank scheme as rank.ts, applied to todos.backlog_rank instead of todos.rank — a separate column, not a separate algorithm.
// created_at is the fallback for an unranked row, not Infinity or a position relative to other rows — both of those broke sorting (NaN comparisons, or ranks shifting as soon as one row got a real rank). created_at is total, immutable, and never moves.

import { rankBetween, RANK_GAP } from "./rank";

export { RANK_GAP };

export interface BacklogRanked {
  backlog_rank: number | null;
  created_at: string;
  id: string;
}

export function effectiveBacklogRank(row: BacklogRanked): number {
  if (row.backlog_rank !== null) return row.backlog_rank;

  const created = Date.parse(row.created_at);

  return Number.isNaN(created) ? 0 : created;
}

// falls back to id so two rows with the same effective rank still sort consistently
export function byBacklogRank(a: BacklogRanked, b: BacklogRanked): number {
  const difference = effectiveBacklogRank(a) - effectiveBacklogRank(b);

  return difference !== 0 ? difference : a.id.localeCompare(b.id);
}

export function backlogRankForAppend(rows: BacklogRanked[]): number {
  if (!rows.length) return RANK_GAP;

  return Math.max(...rows.map(effectiveBacklogRank)) + RANK_GAP;
}

function neighboursAt(
  ordered: BacklogRanked[],
  index: number,
): { before: number | null; after: number | null } {
  const at = Math.max(0, Math.min(index, ordered.length));

  const before = at > 0 ? (ordered[at - 1] ?? null) : null;
  const after = ordered[at] ?? null;

  return {
    before: before ? effectiveBacklogRank(before) : null,
    after: after ? effectiveBacklogRank(after) : null,
  };
}

// list must exclude the card being moved — it can't be its own neighbour
export function backlogRankForDrop<T extends BacklogRanked>(
  list: T[],
  index: number,
): number | null {
  const ordered = list.slice().sort(byBacklogRank);
  const { before, after } = neighboursAt(ordered, index);

  return rankBetween(before, after);
}
