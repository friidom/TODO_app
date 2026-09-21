import { useCallback, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { bucketFromRatio, stepBucket } from "./hover";

export interface ChartHover {
  index: number | null;
  clear: () => void;
  surface: {
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerLeave: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
    onBlur: () => void;
    tabIndex: number;
  };
}

export function useChartHover(
  count: number,
  onPick?: (index: number) => void,
): ChartHover {
  const [index, setIndex] = useState<number | null>(null);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const box = event.currentTarget.getBoundingClientRect();

      if (box.width === 0) return;

      setIndex(bucketFromRatio((event.clientX - box.left) / box.width, count));
    },
    [count],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) =>
          stepBucket(current, event.key === "ArrowRight" ? 1 : -1, count),
        );
        return;
      }

      if (
        (event.key === "Enter" || event.key === " ") &&
        index !== null &&
        onPick
      ) {
        event.preventDefault();
        onPick(index);
      }
    },
    [count, index, onPick],
  );

  const clear = useCallback(() => setIndex(null), []);

  return {
    index,
    clear,
    surface: {
      onPointerMove,
      onPointerLeave: clear,
      onKeyDown,
      onBlur: clear,
      tabIndex: 0,
    },
  };
}
