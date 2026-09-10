import { useCallback, useEffect, useRef, useState } from "react";

import type { Schedulable } from "@/services/todos/useTimelineSchedule";
import { TIMELINE_WINDOW, type TimelineScale } from "@/services/views/timeline";
import {
  columnEnd,
  draftRange,
  moveRange,
  resizeEnd,
  resizeStart,
  tickAtOffset,
  ticksMoved,
  type DayRange,
  type DragMode,
} from "@/services/views/timelineDrag";

// Pointer events, not @dnd-kit — a bar's width follows the pointer continuously, there's no discrete drop target to resolve.
// Raw pointer position lives in a ref and never renders; state only holds the snapped column, so a drag costs a few renders, not one per frame.
export const CREATE_EPIC_KEY = "__create-epic__";

// 8px, matching the board/calendar sensors — a bar is also a click target.
const MOVE_THRESHOLD = 8;

export interface DragTarget {
  key: string;
  todo: Schedulable | null;
  mode: DragMode | "draw";
  base: DayRange | null;
}

interface Gesture extends DragTarget {
  originX: number;
  trackLeft: number;
  trackWidth: number;
  anchorTick: number;
  live: boolean;
  range: DayRange | null;
}

export interface TimelineDrag {
  trackRef: React.RefObject<HTMLDivElement | null>;
  draft: { key: string; range: DayRange } | null;
  dragging: boolean;
  begin: (event: React.PointerEvent, target: DragTarget) => void;
  // Consumes the flag, so it answers true at most once.
  consumeClick: () => boolean;
}

export function useTimelineDrag({
  ticks,
  scale,
  enabled,
  onSchedule,
  onDraw,
}: {
  ticks: string[];
  scale: TimelineScale;
  enabled: boolean;
  onSchedule: (todo: Schedulable, range: DayRange) => Promise<unknown>;
  onDraw: (key: string, range: DayRange) => void;
}): TimelineDrag {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);

  const [draft, setDraft] = useState<{ key: string; range: DayRange } | null>(
    null,
  );

  // Broader than `dragging` — set the moment a pointer goes down, before we know if it'll turn into a click.
  const [active, setActive] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Refreshed every render so a long-lived window listener never closes over a stale mutation.
  const latest = useRef({ ticks, scale, onSchedule, onDraw });

  useEffect(() => {
    latest.current = { ticks, scale, onSchedule, onDraw };
  });

  const rangeAt = useCallback((gesture: Gesture, clientX: number) => {
    const { ticks: axis, scale: zoom } = latest.current;

    if (axis.length === 0) return null;

    const offset = clientX - gesture.trackLeft;
    const tick = () => tickAtOffset(offset, gesture.trackWidth, axis.length);

    if (gesture.mode === "draw") {
      return draftRange(gesture.anchorTick, tick(), axis, zoom);
    }

    if (!gesture.base) return null;

    if (gesture.mode === "move") {
      // Steps in columns, not days, so a week-scale step keeps the same weekday.
      const steps = ticksMoved(
        clientX - gesture.originX,
        gesture.trackWidth,
        axis.length,
      );

      return moveRange(gesture.base, steps * TIMELINE_WINDOW[zoom].span);
    }

    const day = axis[tick()];

    return gesture.mode === "start"
      ? resizeStart(gesture.base, day)
      : resizeEnd(gesture.base, columnEnd(day, zoom));
  }, []);

  const engage = useCallback((mode: DragMode | "draw") => {
    document.body.style.setProperty(
      "cursor",
      mode === "move"
        ? "grabbing"
        : mode === "draw"
          ? "crosshair"
          : "ew-resize",
    );
    document.body.style.setProperty("user-select", "none");

    setDragging(true);
  }, []);

  const finish = useCallback((commit: boolean) => {
    const gesture = gestureRef.current;

    gestureRef.current = null;

    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");

    setActive(false);
    setDragging(false);

    if (!gesture) return;

    if (!gesture.live || !gesture.range) {
      setDraft(null);

      return;
    }

    suppressClickRef.current = true;

    if (!commit) {
      setDraft(null);

      return;
    }

    if (gesture.mode === "draw" && !gesture.todo) {
      setDraft(null);
      latest.current.onDraw(gesture.key, gesture.range);

      return;
    }

    if (!gesture.todo) {
      setDraft(null);

      return;
    }

    const committed = gesture.range;

    const settled = () => {
      // Compared by value, not identity — the move handler reuses the draft object when unchanged, so a ref check would never clear.
      setDraft((current) =>
        current?.key === gesture.key &&
        current.range.start === committed.start &&
        current.range.end === committed.end
          ? null
          : current,
      );
    };

    latest.current
      .onSchedule(gesture.todo, gesture.range)
      .then(settled, settled);
  }, []);

  const begin = useCallback(
    (event: React.PointerEvent, target: DragTarget) => {
      if (!enabled || event.button !== 0 || gestureRef.current) return;

      // Reset here — a resize/sweep sets this flag but fires no click of its own to consume it.
      suppressClickRef.current = false;

      const track = trackRef.current;

      if (!track || latest.current.ticks.length === 0) return;

      const box = track.getBoundingClientRect();

      if (box.width <= 0) return;

      const anchorTick = tickAtOffset(
        event.clientX - box.left,
        box.width,
        latest.current.ticks.length,
      );

      const gesture: Gesture = {
        ...target,
        originX: event.clientX,
        trackLeft: box.left,
        trackWidth: box.width,
        anchorTick,
        live: target.mode !== "move",
        range: null,
      };

      gestureRef.current = gesture;
      setActive(true);

      event.currentTarget.setPointerCapture?.(event.pointerId);

      if (gesture.live) {
        const range = rangeAt(gesture, event.clientX);

        gesture.range = range;
        engage(gesture.mode);

        if (range) setDraft({ key: gesture.key, range });
      }
    },
    [enabled, rangeAt, engage],
  );

  useEffect(() => {
    if (!active) return;

    function onMove(event: PointerEvent) {
      const gesture = gestureRef.current;

      if (!gesture) return;

      if (!gesture.live) {
        if (Math.abs(event.clientX - gesture.originX) < MOVE_THRESHOLD) return;

        gesture.live = true;

        engage(gesture.mode);
      }

      const range = rangeAt(gesture, event.clientX);

      if (!range) return;

      gesture.range = range;

      setDraft((current) =>
        current?.key === gesture.key &&
        current.range.start === range.start &&
        current.range.end === range.end
          ? current
          : { key: gesture.key, range },
      );
    }

    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") finish(false);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, rangeAt, finish, engage]);

  useEffect(() => () => finish(false), [finish]);

  const consumeClick = useCallback(() => {
    const suppress = suppressClickRef.current;

    suppressClickRef.current = false;

    return suppress;
  }, []);

  return { trackRef, draft, dragging, begin, consumeClick };
}
