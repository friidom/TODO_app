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

/**
 * Planning gestures on the axis: move a bar, drag an end, draw a new range
 * (M20-B).
 *
 * **Pointer events rather than `@dnd-kit`, and the reason is what the two
 * libraries answer.** The board's DnD resolves *which gap between which two
 * cards*; the calendar's resolves *which day cell*. Both are discrete drop
 * targets, and a droppable is the right shape for them. A Gantt gesture is not
 * discrete: the bar's **width** has to follow the pointer, which means the
 * answer is a continuous position on one axis rather than a target that was
 * hit. Expressing it as droppables would mean 42 of them per row, measured on
 * every drag, to recover a number that is one division of the track.
 *
 * So this is the timeline's own gesture layer — but it is *not* a second
 * drag-and-drop architecture, because it introduces no drop targets, no
 * collision detection and no overlay. It reads the axis this view already
 * defines (`timelineTicks`, `TIMELINE_WINDOW`) and commits through the mutation
 * hook every other date control already uses.
 *
 * ## Why this does not re-render the board on every pointer move
 *
 * Raw pointer data lives in a ref and never causes a render. React state holds
 * only the **snapped** result, and it is written through an equality check, so
 * a render happens exactly when the bar would actually look different.
 *
 * Snapping is what makes that cheap rather than merely careful: the gesture's
 * output is a column index, so dragging 200px across five columns produces five
 * distinct values, not two hundred. `TimelineRow` is memoised and every row but
 * the dragged one receives `draft: null` unchanged, so those five renders reach
 * one row.
 *
 * The track is measured **once per gesture**, on pointerdown. A
 * `getBoundingClientRect()` in the move handler would be a forced layout on
 * every frame, which is the actual cost people mean by "expensive drag".
 */

/** The create row's draft is keyed by this, since it has no todo id yet. */
export const CREATE_KEY = "__create__";

/**
 * How far a *move* must travel before it stops being a click.
 *
 * 8px, which is the board's and the calendar's `PointerSensor` distance
 * exactly. A bar is also a click target — it opens the task — so this is the
 * line between "I tapped this" and "I am moving this", and a product with two
 * answers to that question feels like two products.
 *
 * **Only `move` uses it.** A resize edge and the create row are not click
 * targets, and making someone travel 8px before a handle they deliberately
 * grabbed responds is latency with nothing bought.
 */
const MOVE_THRESHOLD = 8;

/** What a gesture is acting on. `todo` is null only for the create row. */
export interface DragTarget {
  key: string;
  todo: Schedulable | null;
  /** `"draw"` sweeps out a new range; the rest edit an existing one. */
  mode: DragMode | "draw";
  /** The range the gesture starts from. Null when drawing. */
  base: DayRange | null;
}

/** The live gesture, as the ref holds it. Never in state — see the note above. */
interface Gesture extends DragTarget {
  originX: number;
  trackLeft: number;
  trackWidth: number;
  anchorTick: number;
  /** Whether the pointer has travelled far enough for this to count. */
  live: boolean;
  range: DayRange | null;
}

export interface TimelineDrag {
  /** Attach to the element whose box is exactly the track. */
  trackRef: React.RefObject<HTMLDivElement | null>;
  /** The range being shown for one row, in place of its stored one. */
  draft: { key: string; range: DayRange } | null;
  /** A gesture is in progress — used to suppress hover affordances. */
  dragging: boolean;
  begin: (event: React.PointerEvent, target: DragTarget) => void;
  /**
   * Whether the click that just fired was the tail of a drag and should be
   * ignored. Consumes the flag, so it answers true at most once.
   */
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
  /** False for a viewer, who may read the timeline but not plan on it. */
  enabled: boolean;
  /** Commit for an existing item. Resolves once the write has settled. */
  onSchedule: (todo: Schedulable, range: DayRange) => Promise<unknown>;
  /** The create row swept out a range — open the title form on it. */
  onDraw: (range: DayRange) => void;
}): TimelineDrag {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);

  const [draft, setDraft] = useState<{ key: string; range: DayRange } | null>(
    null,
  );

  /**
   * A gesture is in flight. Distinct from `dragging`, which is the narrower
   * "it has travelled far enough to count", and it exists because the window
   * listeners have to be attached the moment a pointer goes down — including
   * for a move that has not yet cleared its threshold and may still turn out to
   * be a click. Holding that in the ref alone would never re-run the effect.
   */
  const [active, setActive] = useState(false);
  const [dragging, setDragging] = useState(false);

  /**
   * The axis and the commit callbacks as they are *now*.
   *
   * The window listeners are attached once per gesture, so closing over these
   * directly would pin them to the render that started it — a paging step
   * mid-drag would snap against the previous window, and a stale `onSchedule`
   * would commit through a mutation object that had moved on.
   *
   * Written in an effect with no dependency array rather than during render:
   * it runs after every commit, which is the earliest a ref may be touched, and
   * a gesture can only begin from an event handler that runs later still.
   */
  const latest = useRef({ ticks, scale, onSchedule, onDraw });

  useEffect(() => {
    latest.current = { ticks, scale, onSchedule, onDraw };
  });

  /** The range a pointer at `clientX` implies, given the gesture in flight. */
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
      // In columns, then in days — so one step at the `months` scale is a whole
      // week and a task that began on a Wednesday still begins on a Wednesday.
      const steps = ticksMoved(
        clientX - gesture.originX,
        gesture.trackWidth,
        axis.length,
      );

      return moveRange(gesture.base, steps * TIMELINE_WINDOW[zoom].span);
    }

    const day = axis[tick()];

    // An end dropped on a column takes that whole column: the bar you released
    // over is the period you meant. At the `weeks` scale the two are the same
    // day and this is a no-op.
    return gesture.mode === "start"
      ? resizeStart(gesture.base, day)
      : resizeEnd(gesture.base, columnEnd(day, zoom));
  }, []);

  /**
   * The gesture is now real: dress the whole document for it.
   *
   * On the body rather than on the bar, because the pointer spends most of a
   * drag somewhere else — over the rail, over another row, past the edge of the
   * window — and a cursor that reverts the moment it leaves the 16px bar reads
   * as the drag having been dropped. `user-select` is the same argument: a
   * sweep across the track passes over every task title in the rail, and
   * without this it selects all of them.
   */
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

    // A gesture that never travelled far enough is a click. Nothing to commit,
    // nothing to suppress — the bar's own onClick should open the task.
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
      // The create row: no row to write yet, so the range becomes the form's
      // opening value and the draft is handed over with it.
      setDraft(null);
      latest.current.onDraw(gesture.range);

      return;
    }

    if (!gesture.todo) {
      setDraft(null);

      return;
    }

    const committed = gesture.range;

    const settled = () => {
      // Only if this row's draft is still the one this gesture wrote. A second
      // drag started before the first write landed owns the bar now, and
      // clearing it here would snap that one back mid-gesture.
      //
      // **By value, not by identity.** The move handler keeps the *previous*
      // draft object whenever the snapped result is unchanged — that is the
      // render gate — so by the end of a drag the gesture and the draft
      // routinely hold equal ranges in different objects. A reference check
      // would fail there and leave the draft pinned forever, freezing the bar
      // at the position it was dropped in even after the row moved on.
      setDraft((current) =>
        current?.key === gesture.key &&
        current.range.start === committed.start &&
        current.range.end === committed.end
          ? null
          : current,
      );
    };

    // Held until the write settles rather than dropped here — see
    // `useTimelineSchedule` on why that is the frame with no snap-back.
    latest.current
      .onSchedule(gesture.todo, gesture.range)
      .then(settled, settled);
  }, []);

  const begin = useCallback(
    (event: React.PointerEvent, target: DragTarget) => {
      // Left button only, and never a second gesture on top of a live one.
      if (!enabled || event.button !== 0 || gestureRef.current) return;

      // A resize or a sweep sets the suppression flag but produces no click on
      // the bar to spend it — the handles are siblings of the button, not
      // inside it. Left alone it would survive and swallow the *next* genuine
      // click, so a task would refuse to open once after every resize. Clearing
      // it as each gesture starts bounds its life to the click that immediately
      // follows, which is the only one it was ever meant to catch.
      suppressClickRef.current = false;

      const track = trackRef.current;

      if (!track || latest.current.ticks.length === 0) return;

      // The one layout read of the whole gesture.
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
        // A move has to earn the gesture; a handle and the create row do not.
        live: target.mode !== "move",
        range: null,
      };

      gestureRef.current = gesture;
      setActive(true);

      // Capture on the element that was pressed, so the gesture survives the
      // pointer leaving the row — which it will, since a bar is 16px tall and
      // people drag in arcs.
      event.currentTarget.setPointerCapture?.(event.pointerId);

      if (gesture.live) {
        const range = rangeAt(gesture, event.clientX);

        gesture.range = range;
        engage(gesture.mode);

        // A press with no travel on the create row is already a valid
        // one-column range, which is what makes "click to create" and "drag to
        // create" the same gesture rather than two.
        if (range) setDraft({ key: gesture.key, range });
      }
    },
    [enabled, rangeAt, engage],
  );

  // Bound to the window rather than the bar, so a pointer that outruns the
  // element still steers the gesture. Attached only while one is in flight —
  // an idle timeline listens to nothing.
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

      // THE render gate. Snapping means this is false for most moves, so a
      // drag costs one render per column crossed rather than one per frame.
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

  // A gesture cannot outlive the view it was measured against.
  useEffect(() => () => finish(false), [finish]);

  const consumeClick = useCallback(() => {
    const suppress = suppressClickRef.current;

    suppressClickRef.current = false;

    return suppress;
  }, []);

  return { trackRef, draft, dragging, begin, consumeClick };
}
