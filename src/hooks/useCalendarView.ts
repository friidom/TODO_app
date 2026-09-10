import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import {
  CALENDAR_LAYOUTS,
  addDays,
  addMonths,
  startOfWeek,
  type CalendarLayout,
} from "@/services/views/calendar";
import { todayISO } from "@/utils/dueDate";

export interface CalendarView {
  anchor: string;
  layout: CalendarLayout;
  isCurrent: boolean;

  setLayout: (layout: CalendarLayout) => void;
  step: (direction: -1 | 1) => void;
  goToday: () => void;
  // Sets the anchor and the layout in one call — two separate setSearchParams calls in the same handler would both
  // start from the same base URL and the second would overwrite the first's write.
  openDay: (day: string) => void;
}

function isDay(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useCalendarView(): CalendarView {
  const [searchParams, setSearchParams] = useSearchParams();

  // serialised, not the object itself — react-router hands back a fresh URLSearchParams on every location change
  const key = searchParams.toString();

  const today = todayISO();

  const state = useMemo(() => {
    const params = new URLSearchParams(key);

    const raw = params.get("date");
    const layoutRaw = params.get("cal");

    return {
      anchor: isDay(raw) ? raw : today,
      layout: (CALENDAR_LAYOUTS as readonly string[]).includes(layoutRaw ?? "")
        ? (layoutRaw as CalendarLayout)
        : ("month" as CalendarLayout),
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

  // clears the param on today rather than pinning a date that goes stale tomorrow
  const anchorParam = useCallback(
    (params: URLSearchParams, day: string) => {
      if (day === today) params.delete("date");
      else params.set("date", day);
    },
    [today],
  );

  const setAnchor = useCallback(
    (day: string) => write((params) => anchorParam(params, day)),
    [write, anchorParam],
  );

  const setLayout = useCallback(
    (layout: CalendarLayout) =>
      write((params) => {
        if (layout === "month") params.delete("cal");
        else params.set("cal", layout);
      }),
    [write],
  );

  const { anchor, layout } = state;

  const step = useCallback(
    (direction: -1 | 1) =>
      setAnchor(
        layout === "month"
          ? addMonths(anchor, direction)
          : addDays(anchor, direction * 7),
      ),
    [setAnchor, layout, anchor],
  );

  const goToday = useCallback(() => setAnchor(today), [setAnchor, today]);

  const openDay = useCallback(
    (day: string) =>
      write((params) => {
        anchorParam(params, day);
        params.set("cal", "week");
      }),
    [write, anchorParam],
  );

  return {
    anchor,
    layout,
    isCurrent:
      layout === "month"
        ? anchor.slice(0, 7) === today.slice(0, 7)
        : startOfWeek(anchor) === startOfWeek(today),
    setLayout,
    step,
    goToday,
    openDay,
  };
}
