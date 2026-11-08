import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "@/utils/cn";

const KEY_STEP = 16;

export interface ResizeHandleProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  // Prepares the layout for a gesture and returns the width it starts from.
  begin: (handle: HTMLElement) => number;
  preview: (width: number) => void;
  commit: (width: number) => void;
  cancel: () => void;
  fit: (handle: HTMLElement) => void;
  // The same edge further down the column: pointer-only, since the header's
  // handle is already the keyboard's way in, and as tall as --grip-h.
  grip?: boolean;
  // The header's handle for this edge. A grip has no line of its own: hovering
  // it lights the header's, and a drag from it runs on the header's.
  partner?: (handle: HTMLElement) => HTMLElement | null | undefined;
  className?: string;
}

function clamp(width: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, width)));
}

// The gesture only: what a width means for the layout belongs to the caller,
// which is how the List's <col>s and the Timeline's CSS variables share it.
export default function ResizeHandle({
  label,
  hint,
  value,
  min,
  max,
  begin,
  preview,
  commit,
  cancel,
  fit,
  grip = false,
  partner,
  className,
}: ResizeHandleProps) {
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  const hover = (on: boolean) => (event: ReactPointerEvent<HTMLSpanElement>) =>
    partner?.(event.currentTarget)?.toggleAttribute("data-hover", on);

  function onPointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0 || stop.current) return;

    event.preventDefault();
    event.stopPropagation();

    const handle =
      (grip && partner?.(event.currentTarget)) || event.currentTarget;
    const origin = event.clientX;
    const start = begin(handle);
    const body = document.body.style;
    const previous = { cursor: body.cursor, userSelect: body.userSelect };
    let width = start;
    let moved = false;
    let frame = 0;

    const move = (e: PointerEvent) => {
      width = clamp(start + e.clientX - origin, min, max);
      moved = true;

      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          preview(width);
        });
      }
    };

    const finish = (keep: boolean) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", abort);
      window.removeEventListener("keydown", escape, true);
      cancelAnimationFrame(frame);
      body.cursor = previous.cursor;
      body.userSelect = previous.userSelect;
      handle.removeAttribute("data-active");
      stop.current = null;

      if (keep && moved) commit(width);
      else cancel();
    };

    const up = () => finish(true);
    const abort = () => finish(false);
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;

      e.preventDefault();
      e.stopPropagation();
      finish(false);
    };

    handle.setPointerCapture(event.pointerId);
    body.cursor = "col-resize";
    body.userSelect = "none";
    handle.setAttribute("data-active", "");
    stop.current = () => finish(false);

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", abort);
    window.addEventListener("keydown", escape, true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      fit(event.currentTarget);

      return;
    }

    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

    if (!direction) return;

    event.preventDefault();
    event.stopPropagation();

    const start = begin(event.currentTarget);
    const step = direction * KEY_STEP * (event.shiftKey ? 4 : 1);
    const next = clamp(start + step, min, max);

    if (next === start) cancel();
    else commit(next);
  }

  return (
    <span
      {...(grip
        ? {
            "aria-hidden": true,
            tabIndex: -1,
            onPointerEnter: hover(true),
            onPointerLeave: hover(false),
          }
        : {
            role: "separator",
            "aria-orientation": "vertical" as const,
            "aria-label": label,
            "aria-valuenow": Math.round(value),
            "aria-valuemin": min,
            "aria-valuemax": max,
            tabIndex: 0,
            onKeyDown,
          })}
      data-no-drag
      title={hint}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        event.stopPropagation();
        fit(event.currentTarget);
      }}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "group/resize absolute right-0 w-2 cursor-col-resize touch-none outline-none",
        grip
          ? // no z-index: a sticky column has to be able to cover a grip scrolled beneath it
            "bottom-0 h-(--grip-h)"
          : "inset-y-0 z-10",
        className,
      )}
    >
      {/* the edge's one line, down the whole column: --grip-h is how far the
          column runs below the header */}
      {!grip && (
        <span
          aria-hidden
          className="bg-brand pointer-events-none absolute top-0 right-0 hidden h-[calc(100%+var(--grip-h,0px))] w-0.5 group-hover/resize:block group-focus-visible/resize:block group-data-active/resize:block group-data-hover/resize:block"
        />
      )}
    </span>
  );
}
