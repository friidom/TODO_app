import { useEffect, useEffectEvent } from "react";

export interface RevealTarget {
  kind: "comment" | "attachment";
  id: string;
}

const EVENT = "task:reveal";

function flash(element: HTMLElement) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  element.scrollIntoView({
    block: "center",
    behavior: reduce ? "auto" : "smooth",
  });
  element.focus({ preventScroll: true });
  element.classList.remove("jump-flash");
  void element.offsetWidth;
  element.classList.add("jump-flash");
  element.addEventListener(
    "animationend",
    () => element.classList.remove("jump-flash"),
    { once: true },
  );
}

// The section holding the item may first need to switch a tab, clear a filter
// or expand, so they hear about it before the jump, which waits two frames for
// that render to land.
export function reveal(target: RevealTarget) {
  window.dispatchEvent(
    new CustomEvent<RevealTarget>(EVENT, { detail: target }),
  );

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const element = document.getElementById(`${target.kind}-${target.id}`);

      if (element) flash(element);
    }),
  );
}

export function useOnReveal(handler: (target: RevealTarget) => void) {
  const onReveal = useEffectEvent(handler);

  useEffect(() => {
    function listener(event: Event) {
      onReveal((event as CustomEvent<RevealTarget>).detail);
    }

    window.addEventListener(EVENT, listener);

    return () => window.removeEventListener(EVENT, listener);
  }, []);
}
