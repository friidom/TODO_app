import { useState, type KeyboardEvent, type PointerEvent } from "react";

// Which data point of a chart is under the pointer or the keyboard. `indexAt` maps a 0..1 position across the plot
// onto a point, because charts disagree on where a point sits: a burndown's days sit on the edges, a daily series in
// the middle of each day's slot.
export function useChartCursor(
  count: number,
  indexAt: (ratio: number) => number,
) {
  const [index, setIndex] = useState<number | null>(null);

  const clamp = (value: number) => Math.min(Math.max(value, 0), count - 1);

  return {
    index: index === null || count === 0 ? null : clamp(index),

    bind: {
      tabIndex: 0,
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();

        if (rect.width === 0 || count === 0) return;

        setIndex(clamp(indexAt((event.clientX - rect.left) / rect.width)));
      },
      onPointerLeave: () => setIndex(null),
      // Focus shows the latest point, the one a reader most often wants; arrows walk from there.
      onFocus: () => setIndex((current) => current ?? count - 1),
      onBlur: () => setIndex(null),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const next = stepCursor(index ?? count - 1, event.key, count);

        if (next === null) return;

        event.preventDefault();
        setIndex(next);
      },
    },
  };
}

export function stepCursor(
  at: number,
  key: string,
  count: number,
): number | null {
  if (count === 0) return null;

  switch (key) {
    case "ArrowLeft":
      return Math.max(at - 1, 0);
    case "ArrowRight":
      return Math.min(at + 1, count - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
