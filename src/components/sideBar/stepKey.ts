import type { KeyboardEvent } from "react";

// React moves the node on reorder, which blurs it, so focus is put back.
export function stepKey(onStep: (delta: -1 | 1) => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown"))
      return;

    event.preventDefault();

    const target = event.currentTarget;

    onStep(event.key === "ArrowUp" ? -1 : 1);
    requestAnimationFrame(() => target.focus());
  };
}

export const REORDER_KEYS = "Alt+ArrowUp Alt+ArrowDown";
