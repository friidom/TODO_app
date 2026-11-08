import { useLayoutEffect, useRef } from "react";

// .skeleton-in's delay, in global.css.
const FADE_DELAY_MS = 150;

// A load hands off between gates — session, route chunk, page, view — and each
// renders its own skeleton. Restarting .skeleton-in's delayed fade at every
// hand-off is what blanked the screen between them, so a skeleton that mounts
// while another is on screen, or in the commit that removed the last one,
// continues that fade instead. Decided at mount, not render: React can hold a
// rendered tree back (Suspense's reveal throttle) before committing it.
export function createFadeTracker(now: () => number) {
  let onScreen = 0;
  let since = 0;
  let handingOff = false;

  return {
    // The delay to continue the running fade with, or null to start a fresh one.
    mount(): number | null {
      const continues = onScreen > 0 || handingOff;

      onScreen += 1;

      if (!continues) {
        since = now();

        return null;
      }

      return Math.round(FADE_DELAY_MS - (now() - since));
    },

    unmount(): void {
      onScreen -= 1;

      if (onScreen > 0) return;

      // Layout-effect cleanups and mounts of one commit run back to back,
      // before any microtask.
      handingOff = true;
      queueMicrotask(() => {
        handingOff = false;
      });
    },
  };
}

const tracker = createFadeTracker(() => performance.now());

export function useSkeletonFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  // Before paint, so the first frame already has the continued delay.
  useLayoutEffect(() => {
    const delay = tracker.mount();

    if (delay !== null && ref.current) {
      ref.current.style.animationDelay = `${delay}ms`;
    }

    return tracker.unmount;
  }, []);

  return ref;
}
