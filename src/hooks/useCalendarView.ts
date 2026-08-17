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

/**
 * Where the calendar is looking, held in the URL (M19).
 *
 * **A separate hook from `useBoardView`, deliberately.** `useBoardView` holds
 * the state every view shares — scope, filter, search, sort, group — and that
 * is exactly why these two keys do not belong in it: a month anchor means
 * nothing to the board or the list, and adding them there would put two dead
 * params in the one object all four views read. M16's architecture is
 * untouched; this follows its *idiom* rather than editing its file.
 *
 * The idiom, matched exactly: the URL is the store, only non-defaults are
 * written, and every write is `replace: true` so paging through six months
 * costs one back button press rather than six.
 *
 * **`?date=` is a day, not a month**, even though the month layout only reads
 * the month out of it. One param serves both layouts, switching between them
 * keeps your place, and a link to a specific week is expressible. `?cal=month`
 * is the default and therefore never appears.
 *
 * The anchor defaults to today, read at render. That is the one place the clock
 * belongs — `services/views/calendar.ts` is pure and takes the anchor it is
 * given, which is what makes its month boundaries testable.
 */
export interface CalendarView {
  /** The day the view is anchored on, `YYYY-MM-DD`. */
  anchor: string;
  layout: CalendarLayout;
  /** Whether the anchor is today's month or week — what disables "Today". */
  isCurrent: boolean;

  setLayout: (layout: CalendarLayout) => void;
  /** One month or one week, whichever the layout is. */
  step: (direction: -1 | 1) => void;
  goToday: () => void;
  /**
   * Anchor on a day *and* switch to the week layout — the month grid's
   * "+N more" affordance, as **one** action rather than two.
   *
   * **It has to be one call, and that is a property of `useSearchParams`, not a
   * style preference.** react-router hands the functional updater
   * `new URLSearchParams(searchParams)` built from the render that produced the
   * callback — not from any write still in flight. So two calls in one handler
   * both start from the *same* base URL and the second `navigate` overwrites
   * the first: an anchor write followed by `setLayout("week")` would land on
   * `?cal=week` with no `date` at all, opening the week you were already
   * anchored on instead of the day you clicked.
   */
  openDay: (day: string) => void;
}

/** `YYYY-MM-DD` and nothing else. A hand-edited URL is untrusted input. */
function isDay(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useCalendarView(): CalendarView {
  const [searchParams, setSearchParams] = useSearchParams();

  // Keyed on the serialised params, like `useBoardView`: react-router hands
  // back a fresh URLSearchParams on every location change, so reading the
  // object itself would re-run every memo below it on an unrelated param.
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

  /**
   * Today is the default, so anchoring there clears the param rather than
   * pinning a date that will be wrong tomorrow. A shared link reading
   * `/boards/x?view=calendar` opens on the reader's today, which is what
   * someone sending "look at the calendar" means.
   *
   * Written as a mutation over the params rather than as an action, so the one
   * caller that changes the anchor *and* the layout can apply both in a single
   * write. See `openDay`.
   */
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

  // Both params, one navigation. The interface comment above records why the
  // obvious two-line version silently drops the anchor.
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
    // Compared at the granularity the layout pages by, so "Today" is dead only
    // when pressing it would genuinely do nothing: the month view is already
    // there for any day in this month, the week view for any day whose Monday
    // is today's Monday. A ±7-day window would say "current" for a day in the
    // adjacent week, which is a different screen.
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
