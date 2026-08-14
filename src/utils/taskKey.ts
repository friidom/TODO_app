/**
 * A work item's human-readable key — `KAN-12` — assembled from its two halves.
 *
 * The number is `todos.board_key`, allocated per board by the M2-21 trigger.
 * The prefix is `boards.key_prefix`, added by M14 because the number alone
 * stops identifying a card the moment an account has two boards: both would
 * count from 1 and both used to render the same hardcoded `KAN`.
 *
 * Pure and shared, so it lives here rather than in `services/todos/` or
 * `services/boards/` — it belongs to neither, which is the same reason
 * `byRank` is in `utils/rank.ts`. The card, the list row and the detail
 * panel all render a key, and none of them should be assembling it by hand.
 */

/**
 * What `boards.key_prefix` defaults to, mirrored from the column.
 *
 * Two callers, and both are about a board whose real prefix is not available
 * yet: the optimistic row in `useCreateBoard`, and `useKeyPrefix` while the
 * board query is in flight. Kept in step with the default in
 * `supabase/migrations/20260814100000_board_key_prefix.sql`.
 */
export const DEFAULT_KEY_PREFIX = "KAN";

/**
 * `null` while the card is in flight, and that absence is the pending state.
 *
 * `board_key` is assigned by a `BEFORE INSERT` trigger, so an optimistic row
 * has no key until the server answers. Returning null rather than `KAN-null`
 * is what lets the three render sites hide the chip for exactly that moment —
 * the same rule they applied to `board_key` before the prefix existed.
 */
export function taskKey(
  prefix: string,
  boardKey: number | null,
): string | null {
  return boardKey === null ? null : `${prefix}-${boardKey}`;
}
