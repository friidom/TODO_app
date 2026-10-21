import { useCallback, useEffect, useRef, useState } from "react";

import { addDays } from "@/services/views/calendar";
import { windowDays, type TimelineScale } from "@/services/views/timeline";
import {
  NO_LIMITS,
  constrainDraw,
  constrainEnd,
  constrainMove,
  constrainStart,
  daysBetween,
  draftRange,
  indexAtOffset,
  stepsMoved,
  type DayRange,
  type DragLimits,
  type DragMode,
} from "@/services/views/timelineDrag";
import type { TimelineNode } from "@/services/views/timelineHierarchy";

// Pointer events, not @dnd-kit — a bar's width follows the pointer continuously, there's no discrete drop target to resolve.
// Raw pointer position lives in a ref and never renders; state only holds the snapped column, so a drag costs a few renders, not one per frame.
export const CREATE_EPIC_KEY = "__create-epic__";

// 8px, matching the board/calendar sensors — a bar is also a click target.
const MOVE_THRESHOLD = 8;

const EDGE = 48;
const EDGE_SPEED = 14;

export interface DragTarget {
  key: string;
  node: TimelineNode | null;
  mode: DragMode | "draw";
  base: DayRange | null;
  limits?: DragLimits;
}

export interface TimelineDraft {
  key: string;
  range: DayRange;
  // days the whole branch has moved; 0 for anything but a move
  delta: number;
}

interface Gesture extends DragTarget {
  originX: number;
  originScroll: number;
  trackLeft: number;
  trackWidth: number;
  anchorTick: number;
  live: boolean;
  range: DayRange | null;
  lastX: number;
}

export interface TimelineDrag {
  trackRef: React.RefObject<HTMLDivElement | null>;
  draft: TimelineDraft | null;
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
  onSchedule: (target: DragTarget, range: DayRange) => Promise<unknown>;
  onDraw: (key: string, range: DayRange) => void;
}): TimelineDrag {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);

  const [draft, setDraft] = useState<TimelineDraft | null>(null);

  // Broader than `dragging` — set the moment a pointer goes down, before we know if it'll turn into a click.
  const [active, setActive] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Refreshed every render so a long-lived window listener never closes over a stale mutation.
  const latest = useRef({ ticks, scale, onSchedule, onDraw });

  useEffect(() => {
    latest.current = { ticks, scale, onSchedule, onDraw };
  });

  const scroller = () =>
    trackRef.current?.closest<HTMLElement>("[data-timeline-scroll]") ?? null;

  const rangeAt = useCallback((gesture: Gesture, clientX: number) => {
    const { ticks: axis, scale: zoom } = latest.current;

    if (axis.length === 0) return null;

    const scrolled = (scroller()?.scrollLeft ?? 0) - gesture.originScroll;
    const offset = clientX - gesture.trackLeft + scrolled;
    const limits = gesture.limits ?? NO_LIMITS;

    // drawing snaps to whole columns — a one-day click would be a few pixels wide
    // on the coarser scales; moving and resizing go by days
    if (gesture.mode === "draw") {
      const drawn = draftRange(
        gesture.anchorTick,
        indexAtOffset(offset, gesture.trackWidth, axis.length),
        axis,
        zoom,
      );

      return drawn && constrainDraw(drawn, limits);
    }

    if (!gesture.base) return null;

    const days = windowDays(axis, zoom);

    if (gesture.mode === "move") {
      const steps = stepsMoved(
        clientX - gesture.originX + scrolled,
        gesture.trackWidth,
        days,
      );

      return constrainMove(gesture.base, steps, limits);
    }

    const day = addDays(
      axis[0],
      indexAtOffset(offset, gesture.trackWidth, days),
    );

    return gesture.mode === "start"
      ? constrainStart(gesture.base, day, limits)
      : constrainEnd(gesture.base, day, limits);
  }, []);

  const show = useCallback((gesture: Gesture, range: DayRange) => {
    gesture.range = range;

    const delta =
      gesture.mode === "move" && gesture.base
        ? daysBetween(gesture.base.start, range.start)
        : 0;

    setDraft((current) =>
      current?.key === gesture.key &&
      current.range.start === range.start &&
      current.range.end === range.end
        ? current
        : { key: gesture.key, range, delta },
    );
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

    if (gesture.mode === "draw" && !gesture.node) {
      setDraft(null);
      latest.current.onDraw(gesture.key, gesture.range);

      return;
    }

    if (!gesture.node) {
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

    latest.current.onSchedule(gesture, gesture.range).then(settled, settled);
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

      const anchorTick = indexAtOffset(
        event.clientX - box.left,
        box.width,
        latest.current.ticks.length,
      );

      const gesture: Gesture = {
        ...target,
        originX: event.clientX,
        originScroll: scroller()?.scrollLeft ?? 0,
        trackLeft: box.left,
        trackWidth: box.width,
        anchorTick,
        // a resize waits for the threshold too, so a click on a handle alone
        // never moves a date
        live: target.mode === "draw",
        range: null,
        lastX: event.clientX,
      };

      gestureRef.current = gesture;
      setActive(true);

      event.currentTarget.setPointerCapture?.(event.pointerId);

      if (gesture.live) {
        const range = rangeAt(gesture, event.clientX);

        engage(gesture.mode);

        if (range) show(gesture, range);
      }
    },
    [enabled, rangeAt, engage, show],
  );

  useEffect(() => {
    if (!active) return;

    let frame = 0;

    // Near either edge of a scrolled timeline the view pans under the pointer,
    // and the bar keeps following it, so a drag is never capped by the viewport.
    function pan() {
      frame = 0;

      const gesture = gestureRef.current;
      const element = scroller();
      const track = trackRef.current;

      if (!gesture?.live || !element || !track) return;

      const box = element.getBoundingClientRect();
      const rail =
        track.getBoundingClientRect().left - box.left + element.scrollLeft;
      const step =
        gesture.lastX < box.left + rail + EDGE
          ? -EDGE_SPEED
          : gesture.lastX > box.right - EDGE
            ? EDGE_SPEED
            : 0;

      if (step === 0) return;

      const before = element.scrollLeft;

      element.scrollLeft += step;

      if (element.scrollLeft === before) return;

      const range = rangeAt(gesture, gesture.lastX);

      if (range) show(gesture, range);

      frame = requestAnimationFrame(pan);
    }

    function onMove(event: PointerEvent) {
      const gesture = gestureRef.current;

      if (!gesture) return;

      gesture.lastX = event.clientX;

      if (!gesture.live) {
        if (Math.abs(event.clientX - gesture.originX) < MOVE_THRESHOLD) return;

        gesture.live = true;

        engage(gesture.mode);
      }

      const range = rangeAt(gesture, event.clientX);

      if (range) show(gesture, range);

      if (!frame) frame = requestAnimationFrame(pan);
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
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, rangeAt, finish, engage, show]);

  useEffect(() => () => finish(false), [finish]);

  const consumeClick = useCallback(() => {
    const suppress = suppressClickRef.current;

    suppressClickRef.current = false;

    return suppress;
  }, []);

  return { trackRef, draft, dragging, begin, consumeClick };
}
