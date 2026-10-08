import { memo, useEffect, useRef, useState, type RefObject } from "react";

import {
  minimapViewport,
  scrollLeftAt,
  trackRatio,
  type MinimapViewport,
} from "@/utils/minimap";

// Pointer-only: a keyboard user already scrolls the board itself, so there is nothing here to focus or announce.
// All of its state is its own — lifting the scroll position into KanbanBoard would re-render every column per scroll frame.
const BoardMinimap = memo(function BoardMinimap({
  scrollerRef,
  columns,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  columns: number;
}) {
  const [view, setView] = useState<MinimapViewport | null>(null);
  const track = useRef<HTMLDivElement>(null);
  // Where inside the box the pointer took hold of it, so a drag does not snap the box's centre to the pointer.
  const grab = useRef<number | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) return;

    let frame = 0;

    function measure() {
      frame = 0;

      if (!scroller) return;

      const next = minimapViewport(
        scroller.scrollLeft,
        scroller.clientWidth,
        scroller.scrollWidth,
      );

      setView((previous) =>
        previous?.left === next?.left && previous?.width === next?.width
          ? previous
          : next,
      );
    }

    // Scroll fires faster than frames; one measure per frame is all the box can show.
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    scroller.addEventListener("scroll", schedule, { passive: true });

    const observer = new ResizeObserver(schedule);

    // The scroller's own size changes with the window; the row inside it changes with columns and the view settings.
    observer.observe(scroller);

    if (scroller.firstElementChild)
      observer.observe(scroller.firstElementChild);

    schedule();

    return () => {
      scroller.removeEventListener("scroll", schedule);
      observer.disconnect();

      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollerRef]);

  if (!view) return null;

  function ratioAt(clientX: number) {
    const rect = track.current?.getBoundingClientRect();

    return rect ? trackRatio(clientX, rect.left, rect.width) : 0;
  }

  function jumpTo(clientX: number) {
    const scroller = scrollerRef.current;

    if (!scroller) return;

    scroller.scrollTo({
      left: scrollLeftAt(
        ratioAt(clientX),
        scroller.clientWidth,
        scroller.scrollWidth,
      ),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  function dragTo(clientX: number) {
    const scroller = scrollerRef.current;

    if (!scroller || grab.current === null) return;

    scroller.scrollLeft = scrollLeftAt(
      ratioAt(clientX) - grab.current,
      scroller.clientWidth,
      scroller.scrollWidth,
    );
  }

  return (
    <div
      aria-hidden
      className="border-hairline bg-elevated shadow-e2 absolute right-4 bottom-4 z-10 h-10 w-28 rounded-lg border p-1 opacity-90 transition-opacity duration-150 hover:opacity-100"
    >
      <div
        ref={track}
        onPointerDown={(event) => jumpTo(event.clientX)}
        className="relative flex h-full cursor-pointer touch-none gap-0.5"
      >
        {Array.from({ length: columns }, (_, index) => (
          <span key={index} className="bg-wash-strong flex-1 rounded-sm" />
        ))}

        <div
          onPointerDown={(event) => {
            // not the track's own press, which would jump the board to where the box already is
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            grab.current =
              ratioAt(event.clientX) - (view.left + view.width / 2);
          }}
          onPointerMove={(event) => dragTo(event.clientX)}
          onPointerUp={() => {
            grab.current = null;
          }}
          onPointerCancel={() => {
            grab.current = null;
          }}
          style={{
            left: `${view.left * 100}%`,
            width: `${view.width * 100}%`,
          }}
          className="border-brand absolute inset-y-0 cursor-grab rounded-md border-2 active:cursor-grabbing"
        />
      </div>
    </div>
  );
});

export default BoardMinimap;
