import type { Todo } from "@/types/data";
import { toCalendarDay } from "@/utils/dueDate";
import { addDays, addMonths, startOfMonth, startOfWeek } from "./calendar";

/**
 * Work items as ranges over time (M20).
 *
 * **The date arithmetic is M19's, imported rather than rewritten.** `addDays`,
 * `addMonths`, `startOfWeek` and `startOfMonth` live in `calendar.ts` and are
 * pure string maths over `YYYY-MM-DD` with `Date` quarantined behind `Date.UTC`.
 * A second copy here would be a second place a month boundary can be wrong, and
 * the whole reason M19 was built before M20 was to settle these rules once.
 *
 * **Nothing here converts a timezone.** A stored value becomes a day through
 * `toCalendarDay` — a slice, never a parse — and every comparison below is a
 * string comparison, which is correct because the format is fixed-width and
 * big-endian. That is the same rule the calendar follows and `utils/dueDate.ts`
 * records.
 *
 * **Row order is derived here and stored nowhere.** The plan is explicit and
 * the reason is not aesthetic: a timeline whose rows can be dragged into an
 * arbitrary order is a *second surface that writes order*, which would reopen
 * M3-10 and pull M6-A forward on the day it ships. `todos.position` still has
 * exactly one writer, and this module is why.
 *
 * Pure, so it takes the anchor and never reads the clock — which is what makes
 * the window boundaries, the leap years and the clipping testable.
 */

/** The two zoom levels. Order is the order the toggle renders. */
export const TIMELINE_SCALES = ["weeks", "months"] as const;

export type TimelineScale = (typeof TIMELINE_SCALES)[number];

/**
 * How much time a window covers, and what one tick means in it.
 *
 * **Two levels, and no more**, because M20's "explicitly not" list rules out
 * *"zoom levels beyond what the shell contract supports"*. Two is what the
 * calendar's month/week toggle already established as this product's answer to
 * "how far out am I looking", so the timeline says it the same way rather than
 * inventing a slider.
 *
 * `weeks` draws six weeks a day at a time — the same 42-day span as the
 * calendar's month grid, deliberately, so switching between the two views is
 * not also a change of period. `months` draws half a year a week at a time,
 * which is the horizon a quarter's planning needs and the point at which a day
 * column would be two pixels wide.
 */
export const TIMELINE_WINDOW: Record<
  TimelineScale,
  {
    /** Number of columns. */ ticks: number;
    /** Days one column covers. */ span: number;
  }
> = {
  weeks: { ticks: 42, span: 1 },
  months: { ticks: 26, span: 7 },
};

/**
 * One row's placement on the axis, before any of it is drawn.
 *
 * `start` and `end` are inclusive days. A task with only one of the two dates
 * has them equal *and* `isPoint` set, which is the plan's rule stated as data:
 * *"a task with only a due date is a point, not a zero-width bar"*. A task with
 * both dates on the same day is a one-day **range**, not a point — the
 * distinction the plan draws is about how much is known, not about width.
 */
export interface TimelineItem {
  todo: Todo;
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, `YYYY-MM-DD`. */
  end: string;
  /** Only one of the two dates is set, so there is no span to draw. */
  isPoint: boolean;
}

/**
 * The rows a timeline has, in the order it draws them.
 *
 * **A task with neither date is not on the timeline** — the plan says so, and
 * dropping it here rather than at render is what keeps every consumer agreeing
 * about what "on the timeline" means. It is not hidden work, though:
 * `unscheduledCount` exists so the view can report it, the same way the board
 * reports "3 of 57" and the calendar reports what is off-window.
 *
 * **The sort is the milestone's decision.** `start` ascending is the axis read
 * top to bottom; `end` breaks the tie so two items beginning together are
 * ordered by which finishes first; the key breaks that one so the order is
 * total and stable across renders. Nothing here is stored and nothing here is
 * draggable.
 */
export function timelineItems(todos: Todo[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const todo of todos) {
    const start = todo.start_date ? toCalendarDay(todo.start_date) : null;
    const end = todo.due_date ? toCalendarDay(todo.due_date) : null;

    if (start && end) {
      // The database's `todos_date_range_check` forbids start > end, so this
      // cannot normally happen. It is still ordered rather than trusted: a row
      // written before the constraint existed would otherwise render a bar of
      // negative width, and defending here costs one comparison.
      items.push(
        start <= end
          ? { todo, start, end, isPoint: false }
          : { todo, start: end, end: start, isPoint: false },
      );

      continue;
    }

    const only = start ?? end;

    if (!only) continue;

    items.push({ todo, start: only, end: only, isPoint: true });
  }

  return items.sort(compareItems);
}

function compareItems(a: TimelineItem, b: TimelineItem): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  if (a.end !== b.end) return a.end < b.end ? -1 : 1;

  // The key is the item's name and is allocated in creation order, so it is
  // both stable and meaningful. Null only while a just-created card is in
  // flight; those sort last rather than jumping to the top of the timeline.
  const ak = a.todo.board_key ?? Number.MAX_SAFE_INTEGER;
  const bk = b.todo.board_key ?? Number.MAX_SAFE_INTEGER;

  if (ak !== bk) return ak - bk;

  return a.todo.id < b.todo.id ? -1 : a.todo.id > b.todo.id ? 1 : 0;
}

/**
 * Work items with no date at all.
 *
 * **Off the axis, but not out of the view.** The plan's rule is that a task with
 * neither date "is not on the timeline", and that is about *placement* — there
 * is no honest column to draw it in. It is still part of the board, so it is
 * listed in a section of its own beneath the rows rather than reduced to a
 * number. Inventing a date to make it drawable is the one thing that would be
 * worse than either.
 */
export function unscheduledTodos(todos: Todo[]): Todo[] {
  return todos.filter((todo) => !todo.start_date && !todo.due_date);
}

/** How many there are — the navigator's count, from the same rule. */
export function unscheduledCount(todos: Todo[]): number {
  return unscheduledTodos(todos).length;
}

/**
 * The day each column of the window begins on.
 *
 * Always exactly `TIMELINE_WINDOW[scale].ticks` entries, so the axis never
 * changes width as you page — the same fixed-grid rule that makes the
 * calendar's month always six rows, and for the same reason: a header that
 * reflows moves every bar under the pointer.
 *
 * Both scales begin on a Monday, so `index % 7` is a weekday at the `weeks`
 * scale and no separate weekday calculation is needed anywhere.
 */
export function timelineTicks(scale: TimelineScale, anchor: string): string[] {
  const { ticks, span } = TIMELINE_WINDOW[scale];

  const first =
    scale === "weeks" ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));

  return Array.from({ length: ticks }, (_, i) => addDays(first, i * span));
}

/** The day after the window's last — the exclusive end every test uses. */
export function windowEnd(ticks: string[], scale: TimelineScale): string {
  const last = ticks[ticks.length - 1];

  return addDays(last, TIMELINE_WINDOW[scale].span);
}

/**
 * Which column holds `day`, or null when it falls outside the window.
 *
 * A linear scan from the right: the ticks are ascending and there are at most
 * 42 of them, so this is cheaper than the arithmetic it replaces and cannot
 * disagree with the array it is indexing.
 */
export function tickIndexOf(
  day: string,
  ticks: string[],
  scale: TimelineScale,
): number | null {
  if (ticks.length === 0) return null;
  if (day < ticks[0]) return null;
  if (day >= windowEnd(ticks, scale)) return null;

  for (let i = ticks.length - 1; i >= 0; i -= 1) {
    if (ticks[i] <= day) return i;
  }

  return null;
}

/**
 * Where an item's bar sits in the window, or null when it is not in it at all.
 *
 * **A range that runs off the edge is clipped and says so** rather than being
 * dropped. `openStart` / `openEnd` are what the bar renders as a flat, notched
 * end: an item that began in June and ends in October is genuinely part of what
 * is on screen in August, and hiding it would make a busy quarter look empty.
 */
export function placeItem(
  // Only the two ends, so a range that has no row yet — a create sweep, an
  // undated item being drawn on — is placed by the same rule a stored one is,
  // rather than by a second copy of the clipping logic or by a fake `Todo`
  // cast into the shape of one (M20-B).
  item: Pick<TimelineItem, "start" | "end">,
  ticks: string[],
  scale: TimelineScale,
): {
  index: number;
  span: number;
  openStart: boolean;
  openEnd: boolean;
} | null {
  if (ticks.length === 0) return null;

  const first = ticks[0];
  const end = windowEnd(ticks, scale);

  // No overlap at all: entirely before the window, or entirely after it.
  if (item.end < first || item.start >= end) return null;

  const openStart = item.start < first;
  const openEnd = item.end >= end;

  const startIndex = openStart
    ? 0
    : (tickIndexOf(item.start, ticks, scale) ?? 0);
  const endIndex = openEnd
    ? ticks.length - 1
    : (tickIndexOf(item.end, ticks, scale) ?? ticks.length - 1);

  return {
    index: startIndex,
    span: Math.max(1, endIndex - startIndex + 1),
    openStart,
    openEnd,
  };
}

/**
 * The rows that actually intersect the window, each with its placement.
 *
 * **Generic over anything `placeItem` can place**, not fixed to
 * `TimelineItem` — `placeItem` itself already only reads `start`/`end`
 * (M20-B's own doc explains why: a create sweep and an undated row being
 * drawn on need placing too, and neither is a stored `TimelineItem`).
 * `timelineHierarchy.ts`'s Sprint rows are the other shape that needs this
 * same "keep only what is in the window" fold, over a row that carries a
 * `Sprint` instead of a `Todo` — reusing this rather than hand-writing a
 * second copy of the loop.
 */
export function placeItems<T extends Pick<TimelineItem, "start" | "end">>(
  items: T[],
  ticks: string[],
  scale: TimelineScale,
): { item: T; place: NonNullable<ReturnType<typeof placeItem>> }[] {
  const placed = [];

  for (const item of items) {
    const place = placeItem(item, ticks, scale);

    if (place) placed.push({ item, place });
  }

  return placed;
}

/**
 * The month bands across the top, as `{ key, index, span }`.
 *
 * A tick belongs to the month of the day it *begins* on, so at the `months`
 * scale a week straddling the 1st is filed under the month it started in. The
 * alternative — splitting a column between two bands — would misalign the
 * header from the grid it names, which is the one thing a Gantt header may not
 * do.
 */
export function monthBands(
  ticks: string[],
): { key: string; index: number; span: number }[] {
  const bands: { key: string; index: number; span: number }[] = [];

  ticks.forEach((day, index) => {
    const key = day.slice(0, 7);
    const last = bands[bands.length - 1];

    if (last && last.key === key) last.span += 1;
    else bands.push({ key, index, span: 1 });
  });

  return bands;
}

/** `2026-08` → the first of that month, for `monthLabel`. */
export function bandAnchor(key: string): string {
  return `${key}-01`;
}

/**
 * A day as the instant it denotes, at midnight UTC.
 *
 * The same quarantine `calendar.ts` documents: a `Date` exists only inside a
 * formatter, is built through `Date.UTC`, is read back with `timeZone: "UTC"`,
 * and never escapes. Formatting is the one thing string maths cannot do.
 */
function utc(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, date));
}

/**
 * What period is on screen, e.g. `17 Aug – 27 Sep 2026`.
 *
 * The year is printed once, at the end, and the month is dropped from the start
 * when the window does not leave it — the same restraint `weekLabel` uses, for
 * the same reason: a header that always prints everything reads as a bug in the
 * common case.
 */
export function windowLabel(
  ticks: string[],
  scale: TimelineScale,
  locale?: string,
): string {
  if (ticks.length === 0) return "";

  const first = ticks[0];
  const last = addDays(windowEnd(ticks, scale), -1);

  const sameMonth = first.slice(0, 7) === last.slice(0, 7);

  const startOptions: Intl.DateTimeFormatOptions = sameMonth
    ? { day: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "short", timeZone: "UTC" };

  return `${utc(first).toLocaleDateString(locale, startOptions)} – ${utc(
    last,
  ).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

/** How a single tick is labelled: the day of the month it begins on. */
export function tickLabel(day: string): string {
  return String(Number(day.slice(8, 10)));
}

/** One step of the period navigator, at the granularity the scale pages by. */
export function stepAnchor(
  scale: TimelineScale,
  anchor: string,
  direction: -1 | 1,
): string {
  return scale === "weeks"
    ? addDays(anchor, direction * 7)
    : addMonths(anchor, direction);
}

/**
 * Whether the anchor is already showing "now", at the granularity it pages by.
 *
 * Same rule the calendar's Today button uses: dead only when pressing it would
 * genuinely change nothing.
 */
export function isCurrentAnchor(
  scale: TimelineScale,
  anchor: string,
  today: string,
): boolean {
  return scale === "weeks"
    ? startOfWeek(anchor) === startOfWeek(today)
    : anchor.slice(0, 7) === today.slice(0, 7);
}
