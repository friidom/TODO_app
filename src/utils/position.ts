/**
 * Ordering helpers for the dense integer `position` that both `todos` and
 * `columns` carry.
 *
 * `position` is nullable in the schema even though every write path sets it,
 * so the generated row types surface it as `number | null`. Treating a null as
 * 0 keeps the previous behaviour exactly: `a.position - b.position` already
 * coerced null to 0, because JavaScript does that in arithmetic.
 *
 * The real fix is a NOT NULL constraint on both columns. That is a
 * contract-phase migration, so it is deliberately not done here.
 */

/** Any row ordered by `position`. */
export interface Positioned {
  position: number | null;
}

/** Ascending `position` comparator, for `.sort(byPosition)`. */
export function byPosition(a: Positioned, b: Positioned): number {
  return (a.position ?? 0) - (b.position ?? 0);
}
