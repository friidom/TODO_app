export type Side = "before" | "after";

export function reorder<T>(
  ids: readonly T[],
  activeId: T,
  overId: T,
  side: Side,
): T[] {
  if (activeId === overId || !ids.includes(activeId)) return [...ids];

  const rest = ids.filter((id) => id !== activeId);
  const at = rest.indexOf(overId);

  if (at === -1) return [...ids];

  rest.splice(side === "before" ? at : at + 1, 0, activeId);

  return rest;
}

// The dragged item's index in the list once it lands, counted without it.
export function insertionIndex<T>(
  ids: readonly T[],
  activeId: T,
  overId: T,
  side: Side,
): number {
  const rest = ids.filter((id) => id !== activeId);
  const at = rest.indexOf(overId);

  if (at === -1) return rest.length;

  return side === "before" ? at : at + 1;
}

// Gaps run 0..count. The two either side of the dragged item are where it
// already is, so a keyboard step passes over them instead of stopping there.
export function stepGap(
  count: number,
  activeIndex: number,
  from: number,
  step: 1 | -1,
): number | null {
  for (let gap = from + step; gap >= 0 && gap <= count; gap += step) {
    if (gap !== activeIndex && gap !== activeIndex + 1) return gap;
  }

  return null;
}
