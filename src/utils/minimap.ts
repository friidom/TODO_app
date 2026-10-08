export interface MinimapViewport {
  // fractions of the track, 0..1
  left: number;
  width: number;
}

// null when nothing overflows — a navigator for a board that fits has nothing to navigate.
export function minimapViewport(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): MinimapViewport | null {
  if (clientWidth <= 0 || scrollWidth <= clientWidth) return null;

  const width = clientWidth / scrollWidth;
  const left = Math.min(Math.max(scrollLeft / scrollWidth, 0), 1 - width);

  return { left, width };
}

// The scrollLeft that centres the visible window on `ratio` of the track, kept inside the scrollable range.
export function scrollLeftAt(
  ratio: number,
  clientWidth: number,
  scrollWidth: number,
): number {
  const max = Math.max(scrollWidth - clientWidth, 0);
  const target = ratio * scrollWidth - clientWidth / 2;

  return Math.min(Math.max(target, 0), max);
}

// Where a pointer sits along the track, clamped, so a press or drag that strays past an end still means "the end".
export function trackRatio(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
): number {
  if (trackWidth <= 0) return 0;

  return Math.min(Math.max((clientX - trackLeft) / trackWidth, 0), 1);
}
