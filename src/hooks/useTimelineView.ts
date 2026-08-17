import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import {
  TIMELINE_SCALES,
  isCurrentAnchor,
  stepAnchor,
  type TimelineScale,
} from "@/services/views/timeline";
import { todayISO } from "@/utils/dueDate";

/**
 * Where the timeline is looking, held in the URL (M20).
 *
 * **`?date=` is shared with the calendar, deliberately.** Both views answer
 * "where in time am I", and it is the same answer — so switching from a week in
 * September on the calendar to the timeline arrives in September rather than
 * back at today. That is the same property the filter, the search and the sort
 * already have across all five views, and it costs nothing: neither hook writes
 * the other's scale param, so nothing about M19's behaviour changes. `?cal=` is
 * the calendar's layout and `?tl=` is the timeline's scale; each view ignores
 * the other's.
 *
 * **Separate from `useBoardView`, like `useCalendarView` before it.** M16's
 * object holds what every view shares; a period anchor means nothing to the
 * board or the list, and putting it there would give three views two dead
 * params to carry.
 *
 * The idiom is M16's, matched exactly: the URL is the store, only non-defaults
 * are written, and every write is `replace: true` so paging through a quarter
 * costs one Back press rather than twelve.
 *
 * It duplicates a little of `useCalendarView`'s param plumbing rather than
 * extracting a shared writer, which would have meant editing M19's hook. The
 * duplication is ten lines and visible; the alternative was a refactor of a
 * milestone that had just been reviewed.
 */
export interface TimelineView {
  /** The day the window is anchored on, `YYYY-MM-DD`. */
  anchor: string;
  scale: TimelineScale;
  /** Whether the window already holds today — what disables "Today". */
  isCurrent: boolean;

  setScale: (scale: TimelineScale) => void;
  /** One week or one month, whichever the scale pages by. */
  step: (direction: -1 | 1) => void;
  goToday: () => void;
}

/** `YYYY-MM-DD` and nothing else. A hand-edited URL is untrusted input. */
function isDay(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useTimelineView(): TimelineView {
  const [searchParams, setSearchParams] = useSearchParams();

  // Keyed on the serialised params: react-router hands back a fresh
  // URLSearchParams on every location change, so reading the object itself
  // would re-run the memo below on an unrelated param.
  const key = searchParams.toString();

  const today = todayISO();

  const state = useMemo(() => {
    const params = new URLSearchParams(key);

    const raw = params.get("date");
    const scaleRaw = params.get("tl");

    return {
      anchor: isDay(raw) ? raw : today,
      scale: (TIMELINE_SCALES as readonly string[]).includes(scaleRaw ?? "")
        ? (scaleRaw as TimelineScale)
        : ("weeks" as TimelineScale),
    };
  }, [key, today]);

  const write = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);

          mutate(next);

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setAnchor = useCallback(
    (day: string) =>
      write((params) => {
        // Today is the default, so anchoring there clears the param rather than
        // pinning a date that will be wrong tomorrow. A link reading
        // `/boards/x?view=timeline` opens on the reader's today.
        if (day === today) params.delete("date");
        else params.set("date", day);
      }),
    [write, today],
  );

  const setScale = useCallback(
    (scale: TimelineScale) =>
      write((params) => {
        if (scale === "weeks") params.delete("tl");
        else params.set("tl", scale);
      }),
    [write],
  );

  const { anchor, scale } = state;

  const step = useCallback(
    (direction: -1 | 1) => setAnchor(stepAnchor(scale, anchor, direction)),
    [setAnchor, scale, anchor],
  );

  const goToday = useCallback(() => setAnchor(today), [setAnchor, today]);

  return {
    anchor,
    scale,
    isCurrent: isCurrentAnchor(scale, anchor, today),
    setScale,
    step,
    goToday,
  };
}
