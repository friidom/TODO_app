import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import {
  TIMELINE_SCALES,
  isCurrentAnchor,
  stepAnchor,
  type TimelineScale,
} from "@/services/views/timeline";
import { todayISO } from "@/utils/dueDate";

// ?date= is shared with the calendar — both answer "where in time am I", so switching views keeps the same period in view.
export interface TimelineView {
  anchor: string;
  scale: TimelineScale;
  isCurrent: boolean;

  setScale: (scale: TimelineScale) => void;
  step: (direction: -1 | 1) => void;
  goToday: () => void;
}

function isDay(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useTimelineView(): TimelineView {
  const [searchParams, setSearchParams] = useSearchParams();

  // keyed on the serialised string — react-router hands back a fresh URLSearchParams object on every location change
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
        // today is the default, so anchoring there clears the param instead of pinning a date that'll be wrong tomorrow
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
