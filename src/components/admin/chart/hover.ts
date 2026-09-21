export function bucketFromRatio(ratio: number, count: number): number | null {
  if (count <= 0 || Number.isNaN(ratio)) return null;

  return Math.min(count - 1, Math.max(0, Math.floor(ratio * count)));
}

export function stepBucket(
  index: number | null,
  delta: number,
  count: number,
): number | null {
  if (count <= 0) return null;
  if (index === null) return delta > 0 ? 0 : count - 1;

  return Math.min(count - 1, Math.max(0, index + delta));
}

export interface TooltipAnchor {
  left: number;
  flip: boolean;
}

export function tooltipAnchor(index: number, count: number): TooltipAnchor {
  if (count <= 0) return { left: 0, flip: false };

  const left = ((index + 0.5) / count) * 100;

  return { left, flip: left > 62 };
}
